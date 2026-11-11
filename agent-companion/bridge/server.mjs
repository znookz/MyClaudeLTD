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

// tool → activity (ท่าทางของหุ่น + section ในห้อง) — ฝั่งเว็บ map activity → status/ป้าย/ท่าทางต่อเอง
const READ_TOOLS = new Set(['Read', 'LS', 'NotebookRead']);
const SEARCH_TOOLS = new Set(['Grep', 'Glob', 'ToolSearch']);
const WEB_TOOLS = new Set(['WebFetch', 'WebSearch']);
const DELEGATE_TOOLS = new Set(['Task', 'Agent']);
const PLAN_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'EnterPlanMode', 'ExitPlanMode']);
const ASK_TOOLS = new Set(['AskUserQuestion']);

/** status คู่กับแต่ละ activity (ต้องตรงกับ ACTIVITY_STATUS ใน src/types.ts) */
const ACTIVITY_STATUS = {
  idle: 'idle',
  waiting: 'idle',
  planning: 'thinking',
  reading: 'thinking',
  searching: 'thinking',
  web: 'thinking',
  delegating: 'thinking',
  writing: 'coding',
  running: 'coding',
  testing: 'testing',
  done: 'success',
  failed: 'error',
};

const short = (s, n = 60) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---------------- sub-agent ----------------
// แต่ละ session เก็บรายการ sub-agent ที่เรียกใช้อยู่ (tool Task/Agent) → หน้าเว็บวาดเป็นหุ่นจิ๋วข้างตัวแม่
//   PreToolUse  Task/Agent → เพิ่ม (running)
//   PostToolUse Task/Agent → เสร็จ (done) แล้วลบออกหลัง SUB_DONE_MS  (ยกเว้นตัวที่รันเบื้องหลัง: รอ SubagentStop)
//   SubagentStop           → ตัวที่รันเบื้องหลังเสร็จ
const MAX_SUBS = 6;
const SUB_DONE_MS = 4000;
let subSeq = 0;

const subsOf = (sessionId) => agents.get(sessionId)?.subAgents ?? [];

/** ทำเครื่องหมายว่าเสร็จ แล้วตั้งเวลาลบออกจากฉาก — คืนรายการใหม่ หรือ null ถ้าไม่มีตัวที่ตรง */
function finishSub(sessionId, match) {
  const list = subsOf(sessionId);
  const target = list.find((s) => s.status === 'running' && match(s));
  if (!target) return null;
  setTimeout(() => {
    if (!agents.has(sessionId)) return;
    const rest = subsOf(sessionId).filter((s) => s.id !== target.id);
    applyAndBroadcast({ type: 'agent_update', sessionId, subAgents: rest });
  }, SUB_DONE_MS);
  return list.map((s) => (s === target ? { ...s, status: 'done' } : s));
}

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
  // activity เป็นตัวหลัก → status หาจากตารางเดียวกันเสมอ จะได้ไม่ขัดกัน
  const ev = (activity, extra = {}) => ({ ...base, activity, status: ACTIVITY_STATUS[activity], ...extra });

  switch (h.hook_event_name) {
    case 'SessionStart':
      return ev('idle', { file: '', tool: '' });

    case 'UserPromptSubmit':
      return ev('planning', { task: short(h.prompt?.split('\n')[0]) || project, tool: '' });

    case 'PreToolUse': {
      const t = { tool: tool ?? '' };
      if (EDIT_TOOLS.has(tool)) return ev('writing', { ...t, file: input.file_path ?? input.notebook_path ?? '' });
      if (tool === 'Bash') {
        const cmd = String(input.command ?? '');
        return ev(TEST_CMD.test(cmd) ? 'testing' : 'running', { ...t, file: short(`$ ${cmd}`, 70) });
      }
      if (READ_TOOLS.has(tool)) return ev('reading', { ...t, file: input.file_path ?? input.path ?? '' });
      if (SEARCH_TOOLS.has(tool)) return ev('searching', { ...t, file: input.pattern ?? input.query ?? input.path ?? '' });
      if (WEB_TOOLS.has(tool)) return ev('web', { ...t, file: short(input.url ?? input.query ?? '', 70) });
      if (DELEGATE_TOOLS.has(tool)) {
        const sub = {
          id: h.tool_use_id ?? `sub-${++subSeq}`,
          type: input.subagent_type ?? 'general-purpose',
          task: short(input.description ?? input.prompt ?? '', 70) ?? '',
          status: 'running',
          background: input.run_in_background === true,
        };
        const subAgents = [...subsOf(sessionId).filter((s) => s.id !== sub.id), sub].slice(-MAX_SUBS);
        return ev('delegating', { ...t, file: short(input.description ?? input.subagent_type ?? '', 70), subAgents });
      }
      if (PLAN_TOOLS.has(tool)) return ev('planning', { ...t, file: '' });
      if (ASK_TOOLS.has(tool)) return ev('waiting', { ...t, file: 'ถามคำถามผู้ใช้' });
      // tool อื่น ๆ (เช่น MCP) → ถือว่ากำลังรันเครื่องมือ
      return ev('running', { ...t, file: tool ?? '' });
    }

    case 'PostToolUse': {
      const r = h.tool_response;
      const failed = r && typeof r === 'object' && (r.is_error === true || r.success === false || r.interrupted === true);
      // sub-agent ทำงานเสร็จ (ตัวที่รันเบื้องหลัง tool จะคืนค่าทันที → ยังไม่ถือว่าเสร็จ รอ SubagentStop)
      const subAgents = DELEGATE_TOOLS.has(tool)
        ? finishSub(sessionId, (s) => !s.background && (!h.tool_use_id || s.id === h.tool_use_id))
        : null;
      const extra = subAgents ? { subAgents } : {};
      if (failed) return ev('failed', { tool: tool ?? '', ...extra });
      return subAgents ? { ...base, ...extra } : null;
    }

    case 'PostToolUseFailure': {
      const subAgents = DELEGATE_TOOLS.has(tool)
        ? finishSub(sessionId, (s) => !h.tool_use_id || s.id === h.tool_use_id)
        : null;
      return ev('failed', { tool: tool ?? '', ...(subAgents ? { subAgents } : {}) });
    }

    case 'SubagentStop': {
      // ตัวที่รันเบื้องหลังเสร็จ: จับคู่ด้วยชนิด (agent_type) ถ้า payload มีมา ไม่งั้นเอาตัวเบื้องหลังที่เก่าสุด
      const type = h.agent_type ?? h.subagent_type;
      const subAgents =
        (type && finishSub(sessionId, (s) => s.background && s.type === type)) ||
        finishSub(sessionId, (s) => s.background);
      return subAgents ? { ...base, subAgents } : null;
    }

    case 'Notification':
      // ส่วนใหญ่คือ "รออนุญาต" หรือ "รอ input" → ยืนยกมือรอ (ไม่เดินเล่น)
      return ev('waiting', { file: short(h.message, 70) ?? '', tool: '' });

    case 'Stop':
      // จบเทิร์น: sub-agent ที่ค้างอยู่ (ไม่ใช่ตัวเบื้องหลัง) ถือว่าจบไปแล้ว
      return ev('done', { tool: '', subAgents: subsOf(sessionId).filter((s) => s.background && s.status === 'running') });

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
  const subs = ev.subAgents ? ` sub×${ev.subAgents.length}` : '';
  console.log(`[bridge] ${ev.type} ${ev.sessionId.slice(0, 8)} ${ev.status ?? ''}/${ev.activity ?? ''} ${ev.file ?? ''}${subs}`);
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

// พอร์ตถูกใช้อยู่ = มี bridge อีกตัวเปิดไว้แล้ว → ไม่ต้องล้ม (npm start จะเปิดหน้าเว็บต่อได้)
server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`[bridge] พอร์ต ${PORT} ถูกใช้อยู่ — ใช้ bridge ตัวที่เปิดไว้แล้ว`);
});
wss.on('error', () => {}); // ws ส่ง error ของ server ซ้ำมาที่นี่ด้วย

// ผูกกับ 127.0.0.1 เท่านั้น → เครื่องอื่นในเครือข่ายส่ง event ปลอมเข้ามาไม่ได้
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[bridge] ws://localhost:${PORT}  ·  POST http://localhost:${PORT}/hook  ·  author=${DEFAULT_AUTHOR}`);
});
