import { STATUS_META, type AgentState, type AgentStatus } from '../types';
import { useNow } from '../hooks/useNow';
import { formatElapsed } from '../utils/people';
import Avatar from './Avatar';

interface Props {
  agents: AgentState[];
  selectedId: string | null;
  filter: AgentStatus | 'all';
  onSelect: (id: string) => void;
}

const GRID = 'grid grid-cols-[minmax(220px,2fr)_130px_170px_150px_minmax(220px,2.4fr)_70px] gap-3';

export default function SessionTable({ agents, selectedId, filter, onSelect }: Props) {
  const now = useNow();

  return (
    <section aria-label="รายการ sessions" className="overflow-hidden rounded-[18px] border border-[#263247] bg-[#131A26]">
      <div className="border-b border-[#1E2838] px-[18px] py-3.5 text-sm font-semibold">ทุก session</div>
      <div className="overflow-x-auto">
        <div className="min-w-[960px]">
          <div className={`${GRID} px-[18px] py-2.5 text-xs text-[#93A0B4]`}>
            <span>Session</span>
            <span>สั่งงานโดย</span>
            <span>Agent</span>
            <span>สถานะ</span>
            <span>กำลังทำ</span>
            <span>เวลา</span>
          </div>
          {agents.length === 0 && (
            <div className="border-t border-[#1E2838] px-[18px] py-5 text-sm text-[#93A0B4]">ยังไม่มี session</div>
          )}
          {agents.map((a, i) => {
            const meta = STATUS_META[a.status];
            const dimmed = filter !== 'all' && a.status !== filter;
            return (
              <button
                type="button"
                key={a.sessionId}
                onClick={() => onSelect(a.sessionId)}
                aria-pressed={a.sessionId === selectedId}
                className={`${GRID} min-h-[52px] w-full cursor-pointer items-center border-0 border-t border-[#1E2838] px-[18px] py-2 text-left text-sm text-[#E6EBF2] transition-opacity hover:bg-[#1B2433] ${
                  a.sessionId === selectedId ? 'bg-[#1B2433]' : 'bg-transparent'
                } ${dimmed ? 'opacity-35' : ''}`}
              >
                <span className="truncate font-semibold">
                  <span className="font-mono text-xs font-normal text-[#93A0B4]">#{i + 1}</span> {a.task}
                </span>
                <span className="flex items-center gap-2">
                  <Avatar name={a.author} size={22} />
                  <span className="truncate">{a.author}</span>
                </span>
                <span className="truncate text-[#B7C2D3]">
                  Main agent <span className="font-mono text-[11px] text-[#93A0B4]">{a.sessionId.slice(0, 6)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: meta.color }} />
                  {meta.label}
                </span>
                <span className="truncate font-mono text-[12.5px] text-[#B7C2D3]">{a.file || '—'}</span>
                <span className="font-mono text-[12.5px] text-[#93A0B4]">{formatElapsed(now - a.startedAt)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
