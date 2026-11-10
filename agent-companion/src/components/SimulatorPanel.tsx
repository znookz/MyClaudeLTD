import { useState, type ReactNode } from 'react';
import {
  Brain,
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
import { AGENT_STATUSES, STATUS_META, normalizeEvent, type AgentEvent, type AgentState, type AgentStatus } from '../types';
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
  onToggleTask: (a: AgentState) => void;
  onRemove: (id: string) => void;
  onCustomEvent: (e: AgentEvent) => void;
  sharedTaskId: string;
  collabIds: Set<string>;
  log: LogEntry[];
}

const SOCKET_LABEL: Record<SocketStatus, { text: string; cls: string }> = {
  open: { text: 'เชื่อมต่อแล้ว', cls: 'text-emerald-300 bg-emerald-500/15' },
  connecting: { text: 'กำลังเชื่อมต่อ…', cls: 'text-amber-300 bg-amber-500/15' },
  closed: { text: 'หลุด · กำลังลองใหม่', cls: 'text-rose-300 bg-rose-500/15' },
  disabled: { text: 'ปิดอยู่', cls: 'text-slate-400 bg-slate-500/15' },
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
  },
  null,
  2,
);

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-white/5 px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
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
    ghost: 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10',
    danger: 'border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20',
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
    <aside className="flex max-h-[45vh] w-full shrink-0 flex-col overflow-y-auto border-t border-white/10 bg-slate-950/95 md:h-screen md:max-h-none md:w-[380px] md:border-l md:border-t-0">
      {/* ---------- Connection & sound ---------- */}
      <Section title="การเชื่อมต่อ">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-mono text-xs text-slate-300">{p.wsUrl}</div>
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
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          กลุ่มร่วมงาน = ≥ 2 ตัวที่มี taskId เดียวกันและอยู่ใน coding/testing พร้อมกัน · เปิดเสียงเพื่อฟังเสียงคุยและ jingle
        </p>
      </Section>

      {/* ---------- Per-agent controls ---------- */}
      <Section title={`Agents (${p.agents.length})`}>
        {p.agents.length === 0 && <p className="text-xs text-slate-500">ยังไม่มี agent</p>}
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
                  selected ? 'border-sky-400/60 bg-sky-500/5' : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => p.onSelect(a.sessionId)} className="min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} />
                      <span className="truncate text-sm font-semibold">{a.author}</span>
                      <span className="font-mono text-[10px] text-slate-500">{a.sessionId.slice(0, 10)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-400">
                      {a.task}
                      {inCollab && <span className="ml-1.5 text-cyan-300">· กำลังร่วมงาน</span>}
                    </div>
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => p.onToggleTask(a)}
                      title={shared ? 'แยกไปทำงานเดี่ยว' : `เข้าร่วมงาน ${p.sharedTaskId}`}
                      aria-label={shared ? 'แยกไปทำงานเดี่ยว' : 'เข้าร่วมงานกลุ่ม'}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                    >
                      {shared ? <Unlink2 size={14} /> : <Link2 size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => p.onRemove(a.sessionId)}
                      title="ลบออกจากฉาก"
                      aria-label="ลบออกจากฉาก"
                      className="rounded-md p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
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
          className="w-full resize-y rounded-lg border border-white/10 bg-black/40 p-2 font-mono text-[11px] text-slate-200 outline-none focus:border-sky-400/60"
        />
        {jsonError && <p className="mt-1 text-[11px] text-rose-300">{jsonError}</p>}
        <div className="mt-2">
          <Btn onClick={sendJson} icon={Send}>
            ส่ง event เข้าฉาก
          </Btn>
        </div>
      </Section>

      {/* ---------- Event log ---------- */}
      <Section title="Event log">
        <ul className="flex flex-col gap-1 font-mono text-[11px]">
          {p.log.length === 0 && <li className="text-slate-500">—</li>}
          {p.log.map((l) => (
            <li key={l.id} className="flex gap-2 text-slate-400">
              <span className="text-slate-600">{l.time.toLocaleTimeString('th-TH', { hour12: false })}</span>
              <span className={l.source === 'ws' ? 'text-sky-400' : 'text-violet-400'}>{l.source}</span>
              <span className="truncate text-slate-300">{l.text}</span>
            </li>
          ))}
        </ul>
      </Section>
    </aside>
  );
}
