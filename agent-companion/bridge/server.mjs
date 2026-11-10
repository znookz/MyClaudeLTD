// Bridge: Claude Code hooks (HTTP POST)  →  แปลงเป็น AgentEvent  →  broadcast ทาง WebSocket
//
//   Claude Code ──hook.mjs──▶ POST /hook ─┐
//   curl / สคริปต์อื่น ───────▶ POST /event ─┼──▶ ws://localhost:8080 ──▶ หน้าเว็บ 3D
//                                          └── เก็บ state ล่าสุด → ส่ง snapshot ให้ client ที่เพิ่งต่อเข้ามา
//
// รัน:  npm run bridge      (PORT=8080 ค่าเริ่มต้น)

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 8080);
const DEFAULT_AUTHOR = process.env.CLAUDE_AGENT_AUTHOR ?? os.userInfo().username;

/** @type {Map<string, any>} sessionId → AgentState ล่าสุด */
const agents = new Map();

const TEST_CMD = /\b(test|tests|jest|vitest|pytest|mocha|playwright|cypress|phpunit|go test|cargo test|npm t)\b/i;
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch', 'Task', 'TodoWrite']);

const short = (s, n = 60) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * แปลง payload ของ Claude Code hook → AgentEvent
 * payload มี: session_id, cwd, hook_event_name, tool_name, tool_input, prompt, message ...
 */
function translateHook(h) {
  const sessionId = h.session_id;
  if (!sessionId) return null;

  const project = h.cwd ? path.basename(h.cwd) : 'unknown-project';
  const prev = agents.get(sessionId);
  const base = {
    type: 'agent_update',
    sessionId,
    author: h._author ?? prev?.author ?? DEFAULT_AUTHOR,
    // taskId = โปรเจกต์ → session ที่ทำงานในโฟลเดอร์เดียวกันพร้อมกันจะ "บินมารวมกลุ่ม"
    taskId: prev?.taskId ?? project,
    task: prev?.task ?? project,
  };

  const tool = h.tool_name;
  const input = h.tool_input ?? {};

  switch (h.hook_event_name) {
    case 'SessionStart':
      return { ...base, status: 'idle', file: '' };

    case 'UserPromptSubmit':
      return { ...base, status: 'thinking', task: short(h.prompt?.split('\n')[0]) || project };

    case 'PreToolUse': {
      if (EDIT_TOOLS.has(tool)) {
        return { ...base, status: 'coding', file: input.file_path ?? input.notebook_path ?? '' };
      }
      if (tool === 'Bash') {
        const cmd = String(input.command ?? '');
        return { ...base, status: TEST_CMD.test(cmd) ? 'testing' : 'coding', file: short(`$ ${cmd}`, 70) };
      }
      if (READ_TOOLS.has(tool)) {
        return { ...base, status: 'thinking', file: input.file_path ?? input.pattern ?? input.path ?? '' };
      }
      return { ...base, status: 'coding', file: tool ?? '' };
    }

    case 'PostToolUse': {
      const r = h.tool_response;
      const failed = r && typeof r === 'object' && (r.is_error === true || r.success === false || r.interrupted === true);
      return failed ? { ...base, status: 'error' } : null;
    }

    case 'PostToolUseFailure':
      return { ...base, status: 'error' };

    case 'Notification':
      // ส่วนใหญ่คือ "รออนุญาต" หรือ "รอ input" → ถือเป็นสแตนด์บาย
      return { ...base, status: 'idle', file: short(h.message, 70) ?? '' };

    case 'Stop':
      return { ...base, status: 'success' };

    case 'SessionEnd':
      return { type: 'agent_remove', sessionId };

    default:
      return null;
  }
}

function applyAndBroadcast(ev) {
  if (!ev) return;
  if (ev.type === 'agent_remove') agents.delete(ev.sessionId);
  else if (ev.type === 'agent_update') agents.set(ev.sessionId, { ...agents.get(ev.sessionId), ...ev });

  const data = JSON.stringify({ ...ev, ts: Date.now() });
  for (const client of wss.clients) if (client.readyState === 1) client.send(data);
  console.log(`[bridge] ${ev.type} ${ev.sessionId.slice(0, 8)} ${ev.status ?? ''} ${ev.file ?? ''}`);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1_000_000) req.destroy(); // กัน payload ใหญ่ผิดปกติ
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, agents: agents.size, clients: wss.clients.size }));
  }

  if (req.method === 'POST' && (req.url === '/hook' || req.url === '/event')) {
    try {
      const body = await readBody(req);
      if (req.url === '/hook') applyAndBroadcast(translateHook(body));
      else if (body && typeof body.sessionId === 'string') applyAndBroadcast({ type: 'agent_update', ...body });
      res.writeHead(204).end();
    } catch {
      res.writeHead(400).end('bad json');
    }
    return;
  }

  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server });
wss.on('connection', (socket) => {
  // client ใหม่ได้ภาพปัจจุบันทันที ไม่ต้องรอ event ถัดไป
  socket.send(JSON.stringify({ type: 'snapshot', agents: [...agents.values()] }));
});

// ผูกกับ 127.0.0.1 เท่านั้น → เครื่องอื่นในเครือข่ายส่ง event ปลอมเข้ามาไม่ได้
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[bridge] ws://localhost:${PORT}  ·  POST http://localhost:${PORT}/hook  ·  author=${DEFAULT_AUTHOR}`);
});
