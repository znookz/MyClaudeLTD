// เปิด bridge (ws://localhost:8080) และหน้าเว็บ (vite) พร้อมกันด้วยคำสั่งเดียว:  npm start
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('./server.mjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')], {
  cwd: root,
  stdio: 'inherit',
});
vite.on('exit', (code) => process.exit(code ?? 0));
