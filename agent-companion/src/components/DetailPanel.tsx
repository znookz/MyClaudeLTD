import { Bot, MapPin, Radio, Shirt } from 'lucide-react';
import { ACTIVITY_META, STATUS_META, type AgentState, type AgentStatus } from '../types';
import { ACTIVITY_ICON } from './activityIcons';
import { useNow } from '../hooks/useNow';
import { formatElapsed } from '../utils/people';
import Avatar from './Avatar';

interface Action {
  label: string;
  /** สถานะที่จะเปลี่ยนไป (ควบคุมในเครื่องผ่าน simulator) หรือ 'remove' = ลบออกจากฉาก */
  to: AgentStatus | 'remove';
}

/** ปุ่มหลัก/รองที่เปลี่ยนตามสถานะ — เหมือนใน design Agent Floor */
const ACTIONS: Record<AgentStatus, [Action, Action]> = {
  idle: [
    { label: 'ส่ง prompt ต่อ', to: 'thinking' },
    { label: 'ลบออกจากฉาก', to: 'remove' },
  ],
  thinking: [
    { label: 'เริ่มเขียนโค้ด', to: 'coding' },
    { label: 'หยุด', to: 'idle' },
  ],
  coding: [
    { label: 'รันเทสต์', to: 'testing' },
    { label: 'หยุด', to: 'idle' },
  ],
  testing: [
    { label: 'ทำเสร็จ', to: 'success' },
    { label: 'พบข้อผิดพลาด', to: 'error' },
  ],
  success: [
    { label: 'เริ่มงานใหม่', to: 'thinking' },
    { label: 'กลับสแตนด์บาย', to: 'idle' },
  ],
  error: [
    { label: 'ลองใหม่', to: 'coding' },
    { label: 'กลับสแตนด์บาย', to: 'idle' },
  ],
};

const NOTE: Record<AgentStatus, string> = {
  idle: 'ว่างอยู่ · รอ prompt ถัดไป',
  thinking: 'กำลังอ่านและวางแผน',
  coding: 'กำลังแก้ไขโค้ด',
  testing: 'กำลังรันคำสั่งเทสต์',
  success: 'ทำงานเสร็จสมบูรณ์',
  error: 'เกิดข้อผิดพลาด — ต้องมีคนดู',
};

interface Props {
  agent: AgentState | undefined;
  /** ลำดับของ session ในฉาก (เริ่มที่ 1) */
  n: number;
  /** ชื่อชุดแต่งตัวของหุ่นตัวนี้ */
  outfitName: string;
  inCollab: boolean;
  onSetStatus: (sessionId: string, status: AgentStatus) => void;
  onRemove: (sessionId: string) => void;
}

export default function DetailPanel({ agent, n, outfitName, inCollab, onSetStatus, onRemove }: Props) {
  const now = useNow();

  if (!agent) {
    return (
      <section
        aria-label="รายละเอียด session"
        className="rounded-[18px] border border-[#263247] bg-[#131A26] p-[22px] text-sm text-[#93A0B4]"
      >
        ยังไม่มี session ในฉาก — กด “เล่นสคริปต์ทีม 3 ตัว” ด้านล่างเพื่อลองดู
      </section>
    );
  }

  const meta = STATUS_META[agent.status];
  const activity = ACTIVITY_META[agent.activity];
  const ActivityIcon = ACTIVITY_ICON[agent.activity];
  const [primary, secondary] = ACTIONS[agent.status];
  const run = (a: Action) => () => (a.to === 'remove' ? onRemove(agent.sessionId) : onSetStatus(agent.sessionId, a.to));
  const timeline = agent.history.slice(-5);

  return (
    <section
      aria-label="รายละเอียด session"
      className="flex flex-col gap-[18px] rounded-[18px] border border-[#263247] bg-[#131A26] p-[22px]"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-[13px] text-[#93A0B4]">SESSION #{n}</span>
          <span
            className="inline-flex items-center gap-[7px] rounded-full border bg-[#1B2433] px-2.5 py-1 text-[12.5px] font-semibold text-[#E6EBF2]"
            style={{ borderColor: meta.color }}
          >
            <span
              className={`h-2 w-2 rounded-full ${agent.status === 'coding' || agent.status === 'testing' ? 'animate-pulse' : ''}`}
              style={{ background: meta.color }}
            />
            {meta.label}
          </span>
          {inCollab && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/15 px-2.5 py-1 text-[12px] text-cyan-300">
              <Radio size={12} className="animate-pulse" /> กำลังร่วมงาน
            </span>
          )}
        </div>
        <h2 className="m-0 text-2xl font-bold leading-tight">{agent.task}</h2>
        <div className="font-mono text-[12.5px] text-[#93A0B4]">
          {agent.taskId} · {formatElapsed(now - agent.startedAt)} นาที · {agent.steps} ขั้น
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="flex flex-col gap-2 rounded-xl bg-[#1B2433] p-3">
          <div className="text-xs text-[#93A0B4]">สั่งงานโดย</div>
          <div className="flex items-center gap-2">
            <Avatar name={agent.author} size={28} />
            <span className="truncate text-[15px] font-semibold">{agent.author}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 rounded-xl bg-[#1B2433] p-3">
          <div className="text-xs text-[#93A0B4]">ผู้ลงมือ</div>
          <div className="flex items-center gap-2">
            <Bot size={22} className="shrink-0 text-[#E8956A]" aria-hidden="true" />
            <span className="min-w-0 text-sm font-semibold leading-tight">
              Main agent
              <span className="block truncate font-mono text-[11px] font-normal text-[#93A0B4]">
                {agent.sessionId.slice(0, 10)}
              </span>
            </span>
          </div>
          {outfitName && (
            <div className="flex items-center gap-1.5 text-xs text-[#B7C2D3]">
              <Shirt size={12} className="shrink-0" aria-hidden="true" />
              <span className="truncate">ชุด: {outfitName}</span>
            </div>
          )}
        </div>
      </div>

      {agent.subAgents.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[14px] border border-fuchsia-400/40 bg-[#0F141E] p-3.5">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-fuchsia-300">
            <Bot size={14} aria-hidden="true" />
            Sub-agent ที่เรียกใช้ ({agent.subAgents.length})
          </div>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {agent.subAgents.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-[13px]">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${s.status === 'running' ? 'animate-pulse bg-fuchsia-400' : 'bg-[#4ade80]'}`}
                />
                <span className="shrink-0 rounded-md border border-[#33405A] bg-[#0B0F17] px-1.5 py-0.5 font-mono text-[11px]">
                  {s.type}
                </span>
                <span className="min-w-0 flex-1 truncate text-[#D3DAE5]">{s.task || '—'}</span>
                <span className="shrink-0 text-[11px] text-[#93A0B4]">{s.status === 'running' ? 'กำลังทำ' : 'เสร็จแล้ว'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2.5 rounded-[14px] border bg-[#0F141E] p-3.5" style={{ borderColor: meta.color }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-[#93A0B4]">กำลังทำอะไรอยู่</span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
            style={{ background: `${activity.color}22`, color: activity.color }}
            title="section ในห้องที่ agent กำลังทำงานอยู่ (มาจาก tool ล่าสุดใน hook)"
          >
            <MapPin size={12} aria-hidden="true" />
            {activity.section}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[#33405A] bg-[#0B0F17] px-2 py-0.5 font-mono text-xs font-medium">
            <ActivityIcon size={12} aria-hidden="true" />
            {activity.label}
          </span>
          {agent.tool && <span className="font-mono text-xs text-[#93A0B4]">{agent.tool}</span>}
          <span className="break-all font-mono text-[13.5px]">{agent.file || '—'}</span>
        </div>
        <div className="text-sm text-[#D3DAE5]">{NOTE[agent.status]}</div>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="text-[13px] font-semibold">ไทม์ไลน์ล่าสุด</div>
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {timeline.map((ev, i) => (
            <li key={`${ev.ts}-${i}`} className="grid grid-cols-[48px_10px_minmax(0,1fr)] items-baseline gap-2.5">
              <span className="font-mono text-xs text-[#93A0B4]">
                {new Date(ev.ts).toLocaleTimeString('th-TH', { hour12: false, hour: '2-digit', minute: '2-digit' })}
              </span>
              <span
                className={`h-[9px] w-[9px] rounded-full ${i === timeline.length - 1 ? 'animate-pulse' : ''}`}
                style={{ background: ACTIVITY_META[ev.activity].color }}
              />
              <span className="text-[13.5px] leading-snug">
                <span className="font-mono text-xs text-[#B7C2D3]">{ACTIVITY_META[ev.activity].label}</span>
                {ev.file && <> · <span className="break-all">{ev.file}</span></>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={run(primary)}
          className="min-h-11 flex-[1_1_120px] cursor-pointer rounded-[10px] border-0 bg-[#E6EBF2] text-sm font-semibold text-[#0B0F17] hover:bg-white"
        >
          {primary.label}
        </button>
        <button
          type="button"
          onClick={run(secondary)}
          className="min-h-11 flex-[1_1_120px] cursor-pointer rounded-[10px] border border-[#33405A] bg-transparent text-sm font-semibold text-[#E6EBF2] hover:bg-white/5"
        >
          {secondary.label}
        </button>
      </div>
      <p className="m-0 text-[11px] leading-relaxed text-[#93A0B4]">
        ปุ่มด้านบนเปลี่ยนสถานะในหน้านี้เท่านั้น (ไม่ส่งกลับไปที่ Claude Code) · event จริงจาก bridge จะทับค่าเมื่อมาถึง
      </p>
    </section>
  );
}
