import { useState, type ReactNode } from 'react';
import {
  Bot,
  Brain,
  Check,
  CircleCheck,
  Code,
  FlaskConical,
  Link2,
  Moon,
  Play,
  Plus,
  Send,
  Square,
  Trash2,
  TriangleAlert,
  Unlink2,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  ACTIVITY_META,
  AGENT_ACTIVITIES,
  AGENT_STATUSES,
  STATUS_META,
  normalizeEvent,
  type AgentActivity,
  type AgentEvent,
  type AgentState,
  type AgentStatus,
} from '../types';
import { ACTIVITY_ICON } from './activityIcons';
import type { SocketStatus } from '../hooks/useAgentSocket';

export interface LogEntry {
  id: number;
  time: Date;
  source: 'ws' | 'sim';
  text: string;
}

const STATUS_ICON: Record<AgentStatus, LucideIcon> = {
  idle: Moon,
  thinking: Brain,
  coding: Code,
  testing: FlaskConical,
  success: CircleCheck,
  error: TriangleAlert,
};

interface Props {
  agents: AgentState[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  wsUrl: string;
  socketStatus: SocketStatus;
  wsEnabled: boolean;
  onToggleWs: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
  scriptRunning: boolean;
  onRunScript: () => void;
  onStopScript: () => void;
  onCreateTeam: () => void;
  onAddRandom: () => void;
  onClear: () => void;
  onSetStatus: (id: string, s: AgentStatus) => void;
  onSetActivity: (id: string, a: AgentActivity) => void;
  /** เรียก sub-agent เพิ่ม 1 ตัว / ให้ sub-agent ตัวที่ทำอยู่เสร็จ 1 ตัว */
  onSpawnSub: (id: string) => void;
  onFinishSub: (id: string) => void;
  onToggleTask: (a: AgentState) => void;
  onRemove: (id: string) => void;
  onCustomEvent: (e: AgentEvent) => void;
  sharedTaskId: string;
  collabIds: Set<string>;
  log: LogEntry[];
}

const SOCKET_LABEL: Record<SocketStatus, { text: string; cls: string }> = {
  open: { text: 'เชื่อมต่อแล้ว', cls: 'text-emerald-600 bg-emerald-500/15' },
  connecting: { text: 'กำลังเชื่อมต่อ…', cls: 'text-amber-600 bg-amber-500/15' },
  closed: { text: 'หลุด · กำลังลองใหม่', cls: 'text-rose-600 bg-rose-500/15' },
  disabled: { text: 'ปิดอยู่', cls: 'text-[#8b7a9b] bg-slate-500/15' },
};

const SAMPLE_EVENT = JSON.stringify(
  {
    type: 'agent_update',
    sessionId: 'demo-1234',
    author: 'Nook',
    task: 'Refactor auth API',
    taskId: 'checkout',
    file: 'src/api/auth.ts',
    status: 'coding',
    activity: 'writing',
    tool: 'Edit',
  },
  null,
  2,
);

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-[#f0e3ef] px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[#8b7a9b]">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Btn({
  onClick,
  icon: Icon,
  children,
  variant = 'ghost',
  title,
}: {
  onClick: () => void;
  icon?: LucideIcon;
  children?: ReactNode;
  variant?: 'primary' | 'ghost' | 'danger';
  title?: string;
}) {
  const styles = {
    primary: 'bg-sky-500 text-slate-950 hover:bg-sky-400',
    ghost: 'border border-[#eadbea] bg-[#f6ecf5] text-[#4f3f63] hover:bg-[#efe3f1]',
    danger: 'border border-rose-500/30 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20',
  }[variant];
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition ${styles}`}
    >
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
}

export default function SimulatorPanel(p: Props) {
  const [json, setJson] = useState(SAMPLE_EVENT);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const socket = SOCKET_LABEL[p.socketStatus];

  const sendJson = () => {
    try {
      const ev = normalizeEvent(JSON.parse(json));
      if (!ev) throw new Error('ต้องมี sessionId และรูปแบบ event ที่ถูกต้อง');
      p.onCustomEvent(ev);
      setJsonError(null);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'JSON ไม่ถูกต้อง');
    }
  };

  return (
    <aside
      aria-label="Simulator"
      className="flex w-full flex-col overflow-hidden rounded-[18px] border border-[#eadbea] bg-white"
    >
      {/* ---------- Connection & sound ---------- */}
      <Section title="การเชื่อมต่อ">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-mono text-xs text-[#6b5a7d]">{p.wsUrl}</div>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${socket.cls}`}>{socket.text}</span>
          </div>
          <div className="flex gap-2">
            <Btn
              onClick={p.onToggleWs}
              icon={p.wsEnabled ? Wifi : WifiOff}
              title={p.wsEnabled ? 'ปิด WebSocket' : 'เปิด WebSocket'}
            />
            <Btn
              onClick={p.onToggleSound}
              icon={p.soundOn ? Volume2 : VolumeX}
              variant={p.soundOn ? 'primary' : 'ghost'}
              title={p.soundOn ? 'ปิดเสียง' : 'เปิดเสียง (ต้องคลิกก่อนเบราว์เซอร์จึงยอมเล่นเสียง)'}
            />
          </div>
        </div>
      </Section>

      {/* ---------- Scenarios ---------- */}
      <Section title="Simulator">
        <div className="grid grid-cols-2 gap-2">
          {p.scriptRunning ? (
            <Btn onClick={p.onStopScript} icon={Square} variant="danger">
              หยุดสคริปต์
            </Btn>
          ) : (
            <Btn onClick={p.onRunScript} icon={Play} variant="primary">
              เล่นสคริปต์ทีม 3 ตัว
            </Btn>
          )}
          <Btn onClick={p.onCreateTeam} icon={Users}>
            สร้างทีม 3 ตัว
          </Btn>
          <Btn onClick={p.onAddRandom} icon={Plus}>
            เพิ่ม Agent สุ่ม
          </Btn>
          <Btn onClick={p.onClear} icon={Trash2} variant="danger">
            ล้างฉาก
          </Btn>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[#8b7a9b]">
          กลุ่มร่วมงาน = ≥ 2 ตัวที่มี taskId เดียวกันและอยู่ใน coding/testing พร้อมกัน · เปิดเสียงเพื่อฟังเสียงคุยและ jingle
        </p>
      </Section>

      {/* ---------- Per-agent controls ---------- */}
      <Section title={`Agents (${p.agents.length})`}>
        {p.agents.length === 0 && <p className="text-xs text-[#8b7a9b]">ยังไม่มี agent</p>}
        <ul className="flex flex-col gap-2">
          {p.agents.map((a) => {
            const meta = STATUS_META[a.status];
            const selected = p.selectedId === a.sessionId;
            const inCollab = p.collabIds.has(a.sessionId);
            const shared = a.taskId === p.sharedTaskId;
            return (
              <li
                key={a.sessionId}
                className={`rounded-xl border p-3 transition ${
                  selected ? 'border-sky-400/60 bg-sky-500/5' : 'border-[#eadbea] bg-white/[0.02]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => p.onSelect(a.sessionId)} className="min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} />
                      <span className="truncate text-sm font-semibold">{a.author}</span>
                      <span className="font-mono text-[10px] text-[#8b7a9b]">{a.sessionId.slice(0, 10)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-[#8b7a9b]">
                      {a.task}
                      {inCollab && <span className="ml-1.5 text-cyan-600">· กำลังร่วมงาน</span>}
                      {a.subAgents.length > 0 && (
                        <span className="ml-1.5 text-fuchsia-600">· sub-agent ×{a.subAgents.length}</span>
                      )}
                    </div>
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => p.onSpawnSub(a.sessionId)}
                      title="เรียก sub-agent เพิ่ม 1 ตัว"
                      aria-label="เรียก sub-agent เพิ่ม"
                      className="flex items-center gap-0.5 rounded-md p-1.5 text-fuchsia-600 hover:bg-fuchsia-500/20"
                    >
                      <Bot size={14} />
                      <Plus size={10} />
                    </button>
                    {a.subAgents.some((s) => s.status === 'running') && (
                      <button
                        type="button"
                        onClick={() => p.onFinishSub(a.sessionId)}
                        title="ให้ sub-agent 1 ตัวทำงานเสร็จ"
                        aria-label="sub-agent ทำงานเสร็จ"
                        className="flex items-center gap-0.5 rounded-md p-1.5 text-emerald-600 hover:bg-emerald-500/20"
                      >
                        <Bot size={14} />
                        <Check size={10} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => p.onToggleTask(a)}
                      title={shared ? 'แยกไปทำงานเดี่ยว' : `เข้าร่วมงาน ${p.sharedTaskId}`}
                      aria-label={shared ? 'แยกไปทำงานเดี่ยว' : 'เข้าร่วมงานกลุ่ม'}
                      className="rounded-md p-1.5 text-[#8b7a9b] hover:bg-[#efe3f1] hover:text-[#3d2f4f]"
                    >
                      {shared ? <Unlink2 size={14} /> : <Link2 size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => p.onRemove(a.sessionId)}
                      title="ลบออกจากฉาก"
                      aria-label="ลบออกจากฉาก"
                      className="rounded-md p-1.5 text-[#8b7a9b] hover:bg-rose-500/20 hover:text-rose-600"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-6 gap-1">
                  {AGENT_STATUSES.map((s) => {
                    const Icon = STATUS_ICON[s];
                    const active = a.status === s;
                    return (
                      <button
                        type="button"
                        key={s}
                        title={STATUS_META[s].label}
                        aria-label={STATUS_META[s].label}
                        aria-pressed={active}
                        onClick={() => p.onSetStatus(a.sessionId, s)}
                        className="flex h-8 items-center justify-center rounded-md border transition"
                        style={{
                          borderColor: active ? STATUS_META[s].color : 'rgba(255,255,255,0.08)',
                          background: active ? `${STATUS_META[s].color}26` : 'transparent',
                          color: active ? STATUS_META[s].color : '#94a3b8',
                        }}
                      >
                        <Icon size={14} />
                      </button>
                    );
                  })}
                </div>
                {/* activity: ท่าทาง/section ที่ hook จริงจะส่งมา (ตามชื่อ tool) */}
                <div className="mt-1.5 grid grid-cols-6 gap-1">
                  {AGENT_ACTIVITIES.map((act) => {
                    const Icon = ACTIVITY_ICON[act];
                    const m = ACTIVITY_META[act];
                    const active = a.activity === act;
                    return (
                      <button
                        type="button"
                        key={act}
                        title={`${m.label} → ${m.section}`}
                        aria-label={m.label}
                        aria-pressed={active}
                        onClick={() => p.onSetActivity(a.sessionId, act)}
                        className="flex h-7 items-center justify-center rounded-md border transition"
                        style={{
                          borderColor: active ? m.color : 'rgba(255,255,255,0.08)',
                          background: active ? `${m.color}26` : 'transparent',
                          color: active ? m.color : '#94a3b8',
                        }}
                      >
                        <Icon size={13} />
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      {/* ---------- Custom JSON ---------- */}
      <Section title="ส่ง event เอง (JSON)">
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          spellCheck={false}
          rows={8}
          aria-label="JSON event"
          className="w-full resize-y rounded-lg border border-[#eadbea] bg-[#f6ecf5] p-2 font-mono text-[11px] text-[#4f3f63] outline-none focus:border-sky-400/60"
        />
        {jsonError && <p className="mt-1 text-[11px] text-rose-600">{jsonError}</p>}
        <div className="mt-2">
          <Btn onClick={sendJson} icon={Send}>
            ส่ง event เข้าฉาก
          </Btn>
        </div>
      </Section>

      {/* ---------- Event log ---------- */}
      <Section title="Event log">
        <ul className="flex flex-col gap-1 font-mono text-[11px]">
          {p.log.length === 0 && <li className="text-[#8b7a9b]">—</li>}
          {p.log.map((l) => (
            <li key={l.id} className="flex gap-2 text-[#8b7a9b]">
              <span className="text-[#6b5a7d]">{l.time.toLocaleTimeString('th-TH', { hour12: false })}</span>
              <span className={l.source === 'ws' ? 'text-sky-600' : 'text-violet-600'}>{l.source}</span>
              <span className="truncate text-[#6b5a7d]">{l.text}</span>
            </li>
          ))}
        </ul>
      </Section>
    </aside>
  );
}
