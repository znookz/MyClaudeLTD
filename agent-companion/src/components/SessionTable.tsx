import { ACTIVITY_META, STATUS_META, type AgentState, type AgentStatus } from '../types';
import { ACTIVITY_ICON } from './activityIcons';
import { useNow } from '../hooks/useNow';
import { formatElapsed } from '../utils/people';
import Avatar from './Avatar';

interface Props {
  agents: AgentState[];
  selectedId: string | null;
  filter: AgentStatus | 'all';
  onSelect: (id: string) => void;
}

const GRID = 'grid grid-cols-[minmax(220px,2fr)_130px_170px_150px_170px_minmax(220px,2.4fr)_70px] gap-3';

export default function SessionTable({ agents, selectedId, filter, onSelect }: Props) {
  const now = useNow();

  return (
    <section aria-label="รายการ sessions" className="overflow-hidden rounded-[18px] border border-[#eadbea] bg-white">
      <div className="border-b border-[#f0e3ef] px-[18px] py-3.5 text-sm font-semibold">ทุก session</div>
      <div className="overflow-x-auto">
        <div className="min-w-[1130px]">
          <div className={`${GRID} px-[18px] py-2.5 text-xs text-[#8b7a9b]`}>
            <span>Session</span>
            <span>สั่งงานโดย</span>
            <span>Agent</span>
            <span>สถานะ</span>
            <span>Section</span>
            <span>กำลังทำ</span>
            <span>เวลา</span>
          </div>
          {agents.length === 0 && (
            <div className="border-t border-[#f0e3ef] px-[18px] py-5 text-sm text-[#8b7a9b]">ยังไม่มี session</div>
          )}
          {agents.map((a, i) => {
            const meta = STATUS_META[a.status];
            const Icon = ACTIVITY_ICON[a.activity];
            const dimmed = filter !== 'all' && a.status !== filter;
            return (
              <button
                type="button"
                key={a.sessionId}
                onClick={() => onSelect(a.sessionId)}
                aria-pressed={a.sessionId === selectedId}
                className={`${GRID} min-h-[52px] w-full cursor-pointer items-center border-0 border-t border-[#f0e3ef] px-[18px] py-2 text-left text-sm text-[#3d2f4f] transition-opacity hover:bg-[#f6ecf5] ${
                  a.sessionId === selectedId ? 'bg-[#f6ecf5]' : 'bg-transparent'
                } ${dimmed ? 'opacity-35' : ''}`}
              >
                <span className="truncate font-semibold">
                  <span className="font-mono text-xs font-normal text-[#8b7a9b]">#{i + 1}</span> {a.task}
                </span>
                <span className="flex items-center gap-2">
                  <Avatar name={a.author} size={22} />
                  <span className="truncate">{a.author}</span>
                </span>
                <span className="truncate text-[#6b5a7d]">
                  Main agent <span className="font-mono text-[11px] text-[#8b7a9b]">{a.sessionId.slice(0, 6)}</span>
                  {a.subAgents.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-fuchsia-500/15 px-1.5 py-0.5 text-[11px] text-fuchsia-600">
                      +{a.subAgents.length} sub
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: meta.color }} />
                  {meta.label}
                </span>
                <span
                  className="flex min-w-0 items-center gap-1.5 text-[13px]"
                  style={{ color: ACTIVITY_META[a.activity].color }}
                  title={`${ACTIVITY_META[a.activity].section} · ${ACTIVITY_META[a.activity].label}`}
                >
                  <Icon size={13} className="shrink-0" aria-hidden="true" />
                  <span className="truncate">{ACTIVITY_META[a.activity].section}</span>
                </span>
                <span className="truncate font-mono text-[12.5px] text-[#6b5a7d]">{a.file || '—'}</span>
                <span className="font-mono text-[12.5px] text-[#8b7a9b]">{formatElapsed(now - a.startedAt)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
