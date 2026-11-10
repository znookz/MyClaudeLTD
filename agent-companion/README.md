# Agent Companion 3D

เว็บแอป Local แสดงหุ่น AI Agent แบบ 3 มิติ ติดตามสถานะ Claude Code แบบเรียลไทม์
รองรับหลาย session ในฉากเดียว — เมื่อ ≥ 2 ตัวทำงานใน task เดียวกันจะบินมารวมกลุ่ม หันหน้าคุยกัน ยิงลำแสงข้อมูล และพึมพำโต้ตอบกัน

## 1. โครงสร้างโฟลเดอร์

```
agent-companion/
├─ index.html
├─ package.json
├─ vite.config.ts               # React + Tailwind v4 plugin
├─ tsconfig.json
├─ bridge/                      # ฝั่ง Node: รับ hook จาก Claude Code → ส่งต่อทาง WebSocket
│  ├─ server.mjs                # HTTP + WebSocket server ที่ ws://localhost:8080
│  ├─ hook.mjs                  # สคริปต์ที่ Claude Code เรียกในแต่ละ hook
│  └─ claude-settings.example.json
└─ src/
   ├─ main.tsx
   ├─ App.tsx                   # state กลุ่ม, กติการวมกลุ่ม, chatter, Canvas 3D
   ├─ Agent3D.tsx               # หุ่นยนต์ + ท่าทางตามสถานะ + lip sync + กะพริบตา + บิน/หันหน้า
   ├─ CollabBeam.tsx            # ลำแสงประวิ่งระหว่างหัวไหล่
   ├─ SuccessEffect.tsx         # shockwave + ประกายดาว + glow globe
   ├─ index.css                 # Tailwind
   ├─ types.ts                  # AgentStatus, AgentEvent, normalizeEvent()
   ├─ vite-env.d.ts
   ├─ components/
   │  └─ SimulatorPanel.tsx     # Sidebar: ปุ่มจำลอง, คุมรายตัว, ส่ง JSON เอง, event log
   ├─ hooks/
   │  └─ useAgentSocket.ts      # WebSocket client + auto-reconnect
   └─ utils/
      ├─ sound.ts               # Web Audio: jingle, mumble, AnalyserNode ต่อ agent
      ├─ layout.ts              # คำนวณตำแหน่งบ้าน / ตำแหน่งรวมกลุ่ม
      └─ registry.ts            # ทะเบียน anchor หัวไหล่ (ให้ CollabBeam อ่านใน useFrame)
```

## 2. ติดตั้ง

ต้องใช้ Node.js 18 ขึ้นไป

**ใช้โปรเจกต์นี้ตรง ๆ** (package.json มีครบแล้ว)

```bash
cd agent-companion
npm install
```

**หรือสร้างใหม่จากศูนย์** (คำสั่งเดียวกันทั้ง PowerShell และ bash)

```bash
npm create vite@latest agent-companion -- --template react-ts
cd agent-companion
npm install three @react-three/fiber @react-three/drei lucide-react
npm install -D @types/three tailwindcss @tailwindcss/vite ws
```

จากนั้นคัดลอกโฟลเดอร์ `src/`, `bridge/` และ `vite.config.ts` จากโปรเจกต์นี้ไปทับ

## 3. รัน

เปิด 2 เทอร์มินัล

```bash
npm run bridge   # ws://localhost:8080 + รับ hook ที่ POST /hook
npm run dev      # http://localhost:5173
```

ไม่ต้องเปิด bridge ก็ทดสอบได้: กด **“เล่นสคริปต์ทีม 3 ตัว”** ใน Sidebar
กดปุ่ม 🔊 หนึ่งครั้งเพื่อเปิดเสียง (เบราว์เซอร์อนุญาตให้เล่นเสียงหลังผู้ใช้คลิกเท่านั้น)

## 4. ต่อกับ Claude Code จริง

1. เปิด `bridge/claude-settings.example.json` แก้ `/ABSOLUTE/PATH/TO/` เป็น path จริงของโปรเจกต์
   (Windows ใช้ `/` ได้ เช่น `node "C:/dev/agent-companion/bridge/hook.mjs"`)
2. รวมส่วน `"hooks"` เข้าไปใน `~/.claude/settings.json` (ทุกโปรเจกต์) หรือ `.claude/settings.json` (เฉพาะโปรเจกต์)
3. ตั้งชื่อคนสั่งงาน (ไม่ตั้งจะใช้ชื่อ user ของเครื่อง): `CLAUDE_AGENT_AUTHOR=Nook`

การแปลง hook → สถานะ (ใน `bridge/server.mjs`):

| Hook | สถานะ |
|---|---|
| `SessionStart` | idle |
| `UserPromptSubmit` | thinking (ชื่องาน = บรรทัดแรกของ prompt) |
| `PreToolUse` Edit / Write / MultiEdit | coding (+ ชื่อไฟล์) |
| `PreToolUse` Bash ที่เป็นคำสั่งเทสต์ | testing |
| `PreToolUse` Read / Grep / Glob / Task | thinking |
| `PostToolUse` ที่ล้มเหลว | error |
| `Notification` | idle (รออนุญาต / รอ input) |
| `Stop` | success |
| `SessionEnd` | ลบออกจากฉาก |

`taskId` = ชื่อโฟลเดอร์โปรเจกต์ (`cwd`) → session ที่ทำงานในโปรเจกต์เดียวกันพร้อมกันจะบินมารวมกลุ่มเอง

## 5. รูปแบบ Event (WebSocket JSON)

```json
{ "type": "agent_update", "sessionId": "abc123", "author": "Nook",
  "task": "Refactor auth", "taskId": "shop-api", "file": "src/auth.ts", "status": "coding" }
{ "type": "agent_remove", "sessionId": "abc123" }
{ "type": "snapshot", "agents": [ ... ] }
```

`status`: `idle | thinking | coding | testing | success | error` · ทุก field ยกเว้น `sessionId` ส่งเฉพาะที่เปลี่ยนก็ได้ (merge กับค่าเดิม)

ทดสอบด้วย curl:

```bash
curl -X POST http://localhost:8080/event -H "content-type: application/json" \
  -d '{"sessionId":"t1","author":"Nook","task":"Demo","taskId":"demo","status":"coding"}'
```

## 6. หลักการสำคัญในโค้ด

- **แยก "สถานะ" ออกจาก "การเคลื่อนไหว"**: React state เก็บแค่ว่าแต่ละตัว *ควร* อยู่ไหน/ทำอะไร (`Placement`, `status`)
  ส่วนการเคลื่อนไหวทุกเฟรมทำใน `useFrame` ผ่าน ref → ไม่มีการ re-render 60 ครั้ง/วินาที
- **Lerp ที่ไม่ขึ้นกับ frame rate**: `position.lerp(target, 1 - e^(-λ·dt))` ได้ความเร็วเท่ากันทั้งจอ 60 Hz และ 144 Hz
  ท่าทางทุกอย่างใช้ `MathUtils.damp` แบบเดียวกัน จึงเปลี่ยนท่าได้ลื่นโดยไม่ต้องมีระบบ blend
- **LookAt แบบนุ่ม**: `lookAt` ใส่ใน Object3D จำลอง แล้ว `slerp` quaternion ของตัวจริงเข้าหา ไม่หันกระตุก
- **กลุ่มร่วมงานคำนวณจากข้อมูลล้วน** (`computeCollabGroups`): taskId เดียวกัน + coding/testing ≥ 2 ตัว
  พอคำนวณใหม่ ตำแหน่งเป้าหมายเปลี่ยน → หุ่นบินไปเองด้วย lerp ไม่ต้องเขียนแอนิเมชันการบินแยก
- **Lip sync ไม่ต้องมี state "ใครพูด"**: แต่ละ agent มี AnalyserNode ของตัวเองในกราฟเสียง
  ตัวที่ไม่ได้พูดอ่านค่า RMS ได้ ≈ 0 ปากจึงหุบเอง
- **Beam อ่านตำแหน่งไหล่จาก registry** แล้วเขียนลง buffer เดิมของ `Line2` ทุกเฟรม
  (การเรียก `setPositions` ทุกเฟรมจะสร้าง GPU buffer ใหม่และทำให้หน่วยความจำรั่ว)
- **Bridge ผูกกับ 127.0.0.1** และ hook จะ `exit 0` เสมอ → ถ้า bridge ไม่ได้เปิด Claude Code ก็ไม่ค้างหรือพัง
