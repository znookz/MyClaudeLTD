#!/usr/bin/env node
// Claude Code hook → ส่ง payload (stdin) ไปที่ bridge
// ออกแบบให้ "ไม่มีวันขวาง Claude": timeout สั้น, กลืน error ทั้งหมด, exit 0 เสมอ
import os from 'node:os';

const url = `${process.env.AGENT_BRIDGE_URL ?? 'http://localhost:8080'}/hook`;

let input = '';
for await (const chunk of process.stdin) input += chunk;

try {
  const payload = JSON.parse(input || '{}');
  payload._author = process.env.CLAUDE_AGENT_AUTHOR ?? os.userInfo().username;
  await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(800),
  });
} catch {
  // bridge ไม่ได้เปิด → เงียบไว้
}
process.exit(0);
