export type AgentStatus = 'idle' | 'thinking' | 'coding' | 'testing' | 'success' | 'error';

export const AGENT_STATUSES: AgentStatus[] = ['idle', 'thinking', 'coding', 'testing', 'success', 'error'];

/** สถานะที่นับว่า "กำลังลงมือทำงาน" → ใช้ตัดสินว่าจะบินมารวมกลุ่มหรือไม่ */
export const WORKING_STATUSES: AgentStatus[] = ['coding', 'testing'];

export const STATUS_META: Record<AgentStatus, { label: string; color: string }> = {
  idle: { label: 'สแตนด์บาย', color: '#38bdf8' },
  thinking: { label: 'กำลังคิด', color: '#a855f7' },
  coding: { label: 'เขียนโค้ด', color: '#22c55e' },
  testing: { label: 'รันเทสต์', color: '#f97316' },
  success: { label: 'สำเร็จ', color: '#4ade80' },
  error: { label: 'ผิดพลาด', color: '#ef4444' },
};

/**
 * activity = "กำลังทำอะไรอยู่" ละเอียดกว่า status (มาจากชื่อ tool ใน hook)
 * ใช้เลือกท่าทางของหุ่น และบอกว่ากำลังทำงานอยู่ใน "section" ไหนของห้อง
 * status ยังเป็นตัวคุมที่นั่ง/โต๊ะ/การรวมกลุ่มเหมือนเดิม
 */
export type AgentActivity =
  | 'idle'
  | 'planning'
  | 'reading'
  | 'searching'
  | 'web'
  | 'writing'
  | 'running'
  | 'testing'
  | 'delegating'
  | 'waiting'
  | 'done'
  | 'failed';

export const AGENT_ACTIVITIES: AgentActivity[] = [
  'idle',
  'planning',
  'reading',
  'searching',
  'web',
  'writing',
  'running',
  'testing',
  'delegating',
  'waiting',
  'done',
  'failed',
];

export const ACTIVITY_META: Record<AgentActivity, { label: string; section: string; color: string }> = {
  idle: { label: 'ว่างอยู่', section: 'ห้องพักผ่อน', color: '#38bdf8' },
  planning: { label: 'วางแผน', section: 'โซนวางแผน', color: '#a855f7' },
  reading: { label: 'อ่านโค้ด', section: 'ห้องสมุด', color: '#60a5fa' },
  searching: { label: 'ค้นหาในโค้ด', section: 'โซนค้นหา', color: '#2dd4bf' },
  web: { label: 'ค้นคว้าบนเว็บ', section: 'โซนเว็บ', color: '#22d3ee' },
  writing: { label: 'เขียน/แก้ไฟล์', section: 'โซนเขียนโค้ด', color: '#22c55e' },
  running: { label: 'รันคำสั่ง', section: 'เทอร์มินัล', color: '#fbbf24' },
  testing: { label: 'รันเทสต์', section: 'โซนทดสอบ', color: '#f97316' },
  delegating: { label: 'มอบหมายงาน sub-agent', section: 'ห้องประชุม', color: '#e879f9' },
  waiting: { label: 'รอคุณตอบ/อนุญาต', section: 'จุดรอคำสั่ง', color: '#facc15' },
  done: { label: 'ส่งงานแล้ว', section: 'จุดส่งงาน', color: '#4ade80' },
  failed: { label: 'ติดปัญหา', section: 'จุดแก้ปัญหา', color: '#ef4444' },
};

/** activity เริ่มต้นของแต่ละ status (ใช้เมื่อ event ไม่ได้ระบุ activity เช่น จาก simulator หรือสคริปต์อื่น) */
export const DEFAULT_ACTIVITY: Record<AgentStatus, AgentActivity> = {
  idle: 'idle',
  thinking: 'planning',
  coding: 'writing',
  testing: 'testing',
  success: 'done',
  error: 'failed',
};

/** status ที่สอดคล้องกับแต่ละ activity (ใช้ตอน event ระบุ activity มาโดยไม่มี status) */
export const ACTIVITY_STATUS: Record<AgentActivity, AgentStatus> = {
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

export interface HistoryEntry {
  ts: number;
  status: AgentStatus;
  activity: AgentActivity;
  file: string;
}

/** sub-agent ที่ Agent ตัวหนึ่งเรียกใช้ (tool Task/Agent) → แสดงเป็นหุ่นจิ๋วยืนทำงานข้างตัวแม่ */
export interface SubAgentInfo {
  id: string;
  /** ชนิดของ sub-agent เช่น Explore, Plan, general-purpose */
  type: string;
  /** งานที่มอบหมาย (description) */
  task: string;
  status: 'running' | 'done';
}

export const MAX_SUB_AGENTS = 6;

export interface AgentState {
  sessionId: string;
  author: string;
  /** ชื่องานที่แสดงบนป้าย */
  task: string;
  /** คีย์สำหรับจัดกลุ่มงานเดียวกัน (ถ้าไม่ส่งมาจะใช้ task) */
  taskId: string;
  file: string;
  status: AgentStatus;
  /** กำลังทำอะไรอยู่ (ละเอียดกว่า status) → กำหนดท่าทางและ section */
  activity: AgentActivity;
  /** ชื่อ tool ล่าสุดจาก hook (เช่น Edit, Bash, Grep) */
  tool: string;
  updatedAt: number;
  /** เวลาที่เห็น session นี้ครั้งแรก */
  startedAt: number;
  /** จำนวนครั้งที่สถานะ/ไฟล์เปลี่ยน (นับเป็น "ขั้น") */
  steps: number;
  /** ไทม์ไลน์ล่าสุด (เก่า → ใหม่) */
  history: HistoryEntry[];
  /** sub-agent ที่ตัวนี้เรียกใช้อยู่ (รวมตัวที่เพิ่งเสร็จ ซึ่งจะหายไปในไม่กี่วินาที) */
  subAgents: SubAgentInfo[];
}

export interface AgentUpdateEvent {
  type: 'agent_update';
  sessionId: string;
  author?: string;
  task?: string;
  taskId?: string;
  file?: string;
  status?: AgentStatus;
  activity?: AgentActivity;
  tool?: string;
  /** รายการ sub-agent ทั้งหมดของ session นี้ ณ ตอนนี้ (ส่งมา = แทนที่ของเดิมทั้งชุด) */
  subAgents?: SubAgentInfo[];
  ts?: number;
}

export type AgentEvent =
  | AgentUpdateEvent
  | { type: 'agent_remove'; sessionId: string }
  | { type: 'snapshot'; agents: AgentUpdateEvent[] };


const isStatus = (v: unknown): v is AgentStatus =>
  typeof v === 'string' && (AGENT_STATUSES as string[]).includes(v);

const isActivity = (v: unknown): v is AgentActivity =>
  typeof v === 'string' && (AGENT_ACTIVITIES as string[]).includes(v);

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

function subAgentList(v: unknown): SubAgentInfo[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: SubAgentInfo[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const id = str(r.id);
    if (!id) continue;
    out.push({
      id,
      type: str(r.type) || 'sub-agent',
      task: str(r.task) ?? '',
      status: r.status === 'done' ? 'done' : 'running',
    });
  }
  return out.slice(-MAX_SUB_AGENTS);
}

/**
 * แปลง JSON ใด ๆ ที่เข้ามาจาก WebSocket ให้เป็น AgentEvent ที่ปลอดภัย
 * (ข้อมูลจากภายนอกไม่ควรถูกเชื่อแบบตรง ๆ)
 */
export function normalizeEvent(raw: unknown): AgentEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  if (r.type === 'snapshot' && Array.isArray(r.agents)) {
    const agents = r.agents
      .map((a) => normalizeEvent({ ...(a as object), type: 'agent_update' }))
      .filter((e): e is AgentUpdateEvent => e?.type === 'agent_update');
    return { type: 'snapshot', agents };
  }

  const sessionId = str(r.sessionId) ?? str(r.session_id);
  if (!sessionId) return null;

  if (r.type === 'agent_remove') return { type: 'agent_remove', sessionId };

  return {
    type: 'agent_update',
    sessionId,
    author: str(r.author),
    task: str(r.task),
    taskId: str(r.taskId),
    file: str(r.file),
    status: isStatus(r.status) ? r.status : undefined,
    activity: isActivity(r.activity) ? r.activity : undefined,
    tool: str(r.tool),
    subAgents: subAgentList(r.subAgents),
    ts: typeof r.ts === 'number' ? r.ts : undefined,
  };
}
