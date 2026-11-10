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

export interface HistoryEntry {
  ts: number;
  status: AgentStatus;
  file: string;
}

export interface AgentState {
  sessionId: string;
  author: string;
  /** ชื่องานที่แสดงบนป้าย */
  task: string;
  /** คีย์สำหรับจัดกลุ่มงานเดียวกัน (ถ้าไม่ส่งมาจะใช้ task) */
  taskId: string;
  file: string;
  status: AgentStatus;
  updatedAt: number;
  /** เวลาที่เห็น session นี้ครั้งแรก */
  startedAt: number;
  /** จำนวนครั้งที่สถานะ/ไฟล์เปลี่ยน (นับเป็น "ขั้น") */
  steps: number;
  /** ไทม์ไลน์ล่าสุด (เก่า → ใหม่) */
  history: HistoryEntry[];
}

export interface AgentUpdateEvent {
  type: 'agent_update';
  sessionId: string;
  author?: string;
  task?: string;
  taskId?: string;
  file?: string;
  status?: AgentStatus;
  ts?: number;
}

export type AgentEvent =
  | AgentUpdateEvent
  | { type: 'agent_remove'; sessionId: string }
  | { type: 'snapshot'; agents: AgentUpdateEvent[] };


const isStatus = (v: unknown): v is AgentStatus =>
  typeof v === 'string' && (AGENT_STATUSES as string[]).includes(v);

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

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
    ts: typeof r.ts === 'number' ? r.ts : undefined,
  };
}
