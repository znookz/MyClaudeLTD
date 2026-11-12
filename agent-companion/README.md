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
   ├─ Agent3D.tsx               # หุ่นยนต์ + ท่าทางตามสถานะ + lip sync + กะพริบตา + เดิน/นั่ง/หันหน้า
├─ Office.tsx                # ห้อง office: พื้น ผนัง โต๊ะ 9 ตัว โต๊ะประชุม 3 ตัว มุมกาแฟ โซฟา ไวต์บอร์ด ประตู
   ├─ CollabBeam.tsx            # ลำแสงประวิ่งระหว่างหัวไหล่
   ├─ SuccessEffect.tsx         # shockwave + ประกายดาว + glow globe
   ├─ index.css                 # Tailwind
   ├─ types.ts                  # AgentStatus, AgentEvent, normalizeEvent()
   ├─ vite-env.d.ts
   ├─ components/
   │  ├─ DetailPanel.tsx        # แผงรายละเอียด session ที่เลือก: คนสั่ง, กำลังทำอะไร, ไทม์ไลน์, ปุ่มตามสถานะ
   │  ├─ SessionTable.tsx       # ตาราง "ทุก session" คลิกแถวเพื่อเลือก
   │  ├─ Avatar.tsx             # วงกลมอักษรตัวแรกของคนสั่งงาน
   │  └─ SimulatorPanel.tsx     # ปุ่มจำลอง, คุมรายตัว, ส่ง JSON เอง, event log
   ├─ hooks/
   │  ├─ useAgentSocket.ts      # WebSocket client + auto-reconnect
   │  └─ useNow.ts              # นาฬิกาสำหรับแสดงเวลาที่ผ่านไป
   └─ utils/
      ├─ sound.ts               # Web Audio: jingle, mumble, AnalyserNode ต่อ agent
      ├─ office.ts              # ผังห้อง (โต๊ะ/จุดประชุม/จุดเดินเล่น) + pathfinding A* เลี่ยงเฟอร์นิเจอร์
      ├─ layout.ts              # จัดโต๊ะประจำตัว + คำนวณจุดหมายตามสถานะ / รวมกลุ่ม
      ├─ people.ts              # สีประจำตัวคนสั่งงาน, format เวลา
      └─ registry.ts            # ทะเบียน anchor หัวไหล่ (ให้ CollabBeam อ่านใน useFrame)
```

### หน้าจอ (ตาม design "Agent Floor")

เรียงจากบนลงล่าง: **Header** (สถานะการเชื่อมต่อ · จำนวน sessions · จำนวนคน) → **ปุ่มกรองสถานะ** (หุ่นและแถวที่ไม่ตรงจะจางลง)
→ **ฉาก 3 มิติ** คู่กับ **แผงรายละเอียด + Simulator** → **ตารางทุก session**
ธีมมืด `#0B0F17` / การ์ด `#131A26` / เส้นขอบ `#263247` ฟอนต์ IBM Plex Sans Thai + IBM Plex Mono (โหลดจาก Google Fonts, ออฟไลน์ใช้ฟอนต์ระบบแทน)

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

ทางลัด: `npm start` เปิด bridge + หน้าเว็บพร้อมกัน (ถ้ามี bridge เปิดอยู่แล้วจะใช้ตัวเดิม)
hook ใช้แบบ `async` + `exit 0` เสมอ จึงไม่ทำให้ Claude Code ช้าหรือค้างแม้ bridge ไม่ได้เปิด

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

**activity / section** — นอกจาก `status` แล้ว bridge ส่ง `activity` + `tool` ที่ละเอียดกว่า (ฝั่งเว็บใช้เลือกท่าทางและป้าย section ใน `ACTIVITY_META` ที่ `src/types.ts`):

| Hook / tool | activity | section | ท่าทาง |
|---|---|---|---|
| `UserPromptSubmit`, TodoWrite | planning | โซนวางแผน | จับคาง + halo |
| Read / LS | reading | ห้องสมุด | ถือเอกสาร กวาดสายตา + แผงเอกสาร |
| Grep / Glob | searching | โซนค้นหา | ส่องแว่นขยาย |
| WebFetch / WebSearch | web | โซนเว็บ | ชี้ลูกโลก |
| Edit / Write / MultiEdit | writing | โซนเขียนโค้ด | พิมพ์รัว + คีย์บอร์ดโฮโลแกรม |
| Bash (ทั่วไป) / tool อื่น | running | เทอร์มินัล | พิมพ์เป็นช่วง + แผงเทอร์มินัล |
| Bash (เทสต์) | testing | โซนทดสอบ | สแกน + วงแหวน |
| Task / Agent | delegating | ห้องประชุม | ชี้สั่งงาน + วงสัญญาณ |
| `Notification`, AskUserQuestion | waiting | จุดรอคำสั่ง | ยืนยกมือโบก (ไม่เดินเล่น) |
| `Stop` | done | จุดส่งงาน | ฉลอง |
| PostToolUse ล้มเหลว | failed | จุดแก้ปัญหา | สั่นเตือน |

event ที่ไม่ส่ง `activity` (เช่น simulator/curl) จะใช้ค่าเริ่มต้นตาม `status` · section แสดงใน HUD เหนือหัว, แผงรายละเอียด และตาราง session

**sub-agent** — เมื่อ session เรียก tool `Task`/`Agent` bridge จะเพิ่ม sub-agent เข้ารายการ `subAgents` ของ session นั้น (สูงสุด 6 ตัว) หน้าเว็บวาดเป็นหุ่นจิ๋วใส่ชุดเดียวกับตัวแม่ยืนข้างตัวแม่ พร้อมลำแสงสีชมพู
- `PreToolUse` Task/Agent → เพิ่ม (กำลังทำ) · `PostToolUse` → เสร็จ แล้วหายไปใน ~4 วินาที
- ตัวที่รันเบื้องหลัง (`run_in_background`) จะเสร็จเมื่อได้ hook `SubagentStop` — ต้องเพิ่ม hook นี้ใน settings (ดู `claude-settings.example.json`)
- ทดสอบใน simulator ได้: ปุ่มไอคอนหุ่น +/✓ ของแต่ละ agent

**ชุดแต่งตัว** — มี 15 ชุด (`src/utils/outfits.ts`) แต่ละ session ได้ชุดไม่ซ้ำกันและคงเดิมตลอดอายุ session

**ห้องพักผ่อน** — อยู่ทางซ้ายของห้องทำงาน (ผนังกระจกครึ่งบน + ช่องประตู) มีตู้เกม เกมคอนโซล โต๊ะพูล โซฟา และ Racing Sim Rig (โครงอลูมิเนียม เบาะ bucket พวงมาลัย แป้นเหยียบ คันเกียร์ จอโค้ง 3 จอ) agent ที่ว่างจะเดินไปเล่นเองและอยู่นานกว่าจุดอื่น (agent เครียดจาก error จะชอบไปขับ rig) ที่โต๊ะพูลลูกบิลเลียดกลิ้ง ชนกัน เด้งขอบ และตกหลุมจริง (`src/utils/pool.ts`)

- **ภาพเกมจริงบนจอ** — ตู้เกม (Pong / Snake) และทีวี (Space Invaders) มี AI เล่นเองวาดลง CanvasTexture ~30fps เฉพาะตอนมี agent เล่นอยู่ ไม่มีคนเล่นแสดงหน้า INSERT COIN นิ่ง ๆ (`src/utils/miniGames.ts`)
- **เกมแข่งรถ** (`src/utils/racingGame.ts`) — pseudo-3D แบบ OutRun มีโค้ง/เนิน รถคู่แข่ง เกียร์ 1-6 (HUD + เสียงเครื่อง) ชนแล้วช้าลง นับรอบ/เวลา ภาพเดียวแบ่งเป็น 3 จอต่อกัน; agent นั่งอยู่ = autopilot ขับเอง พวงมาลัย/คันเกียร์/แป้นเหยียบขยับตามค่าจริงของเกม
- **วิธีเล่นเอง** — เอาเมาส์ชี้ที่ rig จะมี HUD บอกวิธีเล่น คลิกที่ rig เพื่อ takeover: `←/→` หรือ `A/D` เลี้ยว · `↑/W` เร่ง · `↓/S` เบรก · `Q/E` เกียร์ลง/ขึ้น · `Esc` ออก (ระหว่างเล่นลูกศรจะไม่เลื่อนกล้อง)

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

## 7. ห้อง office และการเดิน

- Agent ใหม่เดินเข้ามาทางประตู (ผนังขวา) แล้วไปที่โต๊ะประจำตัว (จัดตอนเข้ามาและคงเดิมจน session จบ)
- **thinking / coding / testing / error** → นั่งที่โต๊ะ (จอบนโต๊ะเรืองตามสถานะ) · **success** → ลุกยืนฉลองหลังเก้าอี้
- **idle** → ยืนรอแล้วเดินเล่นไปจุดต่าง ๆ: ชั้นหนังสือ กาแฟ ตู้ขนม ตู้น้ำ โซฟา (นั่ง) ไวต์บอร์ด เครื่องปริ้นท์ — จองจุดไม่ให้ซ้อนกัน
- **ร่วมงาน task เดียวกัน** → เดินไปล้อมโต๊ะประชุม (โต๊ะเรืองแสงเมื่อมีกลุ่มใช้งาน)
- เดินด้วยความเร็วคงที่ตามเส้นทาง A* บน grid 0.25 หน่วย แล้ว string-pulling ให้เป็นเส้นตรงยาว ๆ; ท่าเดิน/นั่งคำนวณจากเฟสก้าวเดียวกันทั้งขา แขน และตัว
- ผนังที่อยู่ระหว่างกล้องกับห้องจะซ่อนเองตอนหมุนกล้อง
- แก้ผังห้องที่ `src/utils/office.ts` (DESKS, MEETING_SPOTS, POIS, rects/circles ที่เป็นสิ่งกีดขวาง) และวาดเพิ่มใน `Office.tsx`
