import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { Radio } from 'lucide-react';
import Agent3D from './Agent3D';
import CollabBeam from './CollabBeam';
import Office from './Office';
import DetailPanel from './components/DetailPanel';
import SessionTable from './components/SessionTable';
import SimulatorPanel, { type LogEntry } from './components/SimulatorPanel';
import { useAgentSocket, type SocketStatus } from './hooks/useAgentSocket';
import {
  ACTIVITY_STATUS,
  AGENT_STATUSES,
  type AgentActivity,
  DEFAULT_ACTIVITY,
  STATUS_META,
  type AgentEvent,
  type AgentState,
  type AgentStatus,
  type AgentUpdateEvent,
  MAX_SUB_AGENTS,
  type SubAgentInfo,
} from './types';
import {
  assignDesks,
  computeCollabGroups,
  computePlacements,
  computeSubPlacements,
  groupSpots,
  subKey,
} from './utils/layout';
import { DESKS } from './utils/office';
import { OUTFITS, assignOutfits } from './utils/outfits';
import { playMumble, playSuccessJingle, setMuted, unlockAudio, voicePitchFor } from './utils/sound';

const WS_URL: string = import.meta.env.VITE_AGENT_WS ?? 'ws://localhost:8080';
const CHATTER_INTERVAL_MS = 4000;
/** sub-agent ที่เสร็จแล้วยังฉลองอยู่ข้างตัวแม่นานเท่านี้ ก่อนหายไป (simulator) */
const SUB_DONE_MS = 4000;
const SUB_BEAM_COLOR = '#e879f9';

/** ชนิดของ sub-agent → ท่าทางของหุ่นจิ๋ว */
function subActivity(type: string): AgentActivity {
  if (/explore|search|find/i.test(type)) return 'searching';
  if (/plan|architect/i.test(type)) return 'planning';
  if (/review|audit|security|guide/i.test(type)) return 'reading';
  if (/test|qa/i.test(type)) return 'testing';
  if (/web|fetch|research/i.test(type)) return 'web';
  return 'writing';
}

const SIM_SUB_TYPES = ['Explore', 'Plan', 'general-purpose', 'code-reviewer', 'test-runner', 'web-fetch'];
const SIM_SUB_TASKS = ['สำรวจโครงสร้างโค้ด', 'วางแผน implementation', 'แก้ไฟล์ที่เกี่ยวข้อง', 'รีวิว diff', 'รันชุดเทสต์', 'อ่านเอกสาร API'];
const SHARED_TASK_ID = 'checkout';

// ============================================================
//  State: Agent ทั้งหมดในฉาก (reducer เดียว ใช้ร่วมกันทั้ง WS และ Simulator)
// ============================================================
interface Store {
  agents: Record<string, AgentState>;
  /** ลำดับที่ Agent เข้ามา → ใช้จัดตำแหน่งบ้านให้คงที่ */
  order: string[];
}

type Action = AgentEvent | { type: 'clear' };

const HISTORY_LIMIT = 12;

function mergeAgent(prev: AgentState | undefined, ev: AgentUpdateEvent): AgentState {
  const now = Date.now();
  const status = ev.status ?? (ev.activity ? ACTIVITY_STATUS[ev.activity] : undefined) ?? prev?.status ?? 'idle';
  const file = ev.file ?? prev?.file ?? '';
  // activity: ถ้า event ไม่ได้ระบุแต่ status เปลี่ยน (เช่นกดจาก simulator) ให้ใช้ค่าเริ่มต้นของ status นั้น
  const statusChanged = !!prev && status !== prev.status;
  const activity = ev.activity ?? (statusChanged || !prev ? DEFAULT_ACTIVITY[status] : prev.activity);
  const tool = ev.tool ?? (ev.activity || statusChanged ? '' : (prev?.tool ?? ''));
  // นับเป็น "ขั้น" ใหม่ เมื่อสถานะ/activity/ไฟล์เปลี่ยนเท่านั้น
  const changed = !prev || status !== prev.status || activity !== prev.activity || file !== prev.file;
  return {
    sessionId: ev.sessionId,
    author: ev.author ?? prev?.author ?? 'unknown',
    task: ev.task ?? prev?.task ?? 'Untitled task',
    taskId: ev.taskId ?? prev?.taskId ?? ev.task ?? 'default',
    file,
    status,
    activity,
    tool,
    updatedAt: now,
    startedAt: prev?.startedAt ?? now,
    steps: (prev?.steps ?? 0) + (changed ? 1 : 0),
    history: changed
      ? [...(prev?.history ?? []), { ts: now, status, activity, file }].slice(-HISTORY_LIMIT)
      : (prev?.history ?? []),
    subAgents: ev.subAgents ?? prev?.subAgents ?? [],
  };
}

function reducer(state: Store, action: Action): Store {
  switch (action.type) {
    case 'agent_update': {
      const prev = state.agents[action.sessionId];
      const next = mergeAgent(prev, action);
      return {
        agents: { ...state.agents, [action.sessionId]: next },
        order: prev ? state.order : [...state.order, action.sessionId],
      };
    }
    case 'agent_remove': {
      if (!state.agents[action.sessionId]) return state;
      const agents = { ...state.agents };
      delete agents[action.sessionId];
      return { agents, order: state.order.filter((id) => id !== action.sessionId) };
    }
    case 'snapshot': {
      let next: Store = { agents: {}, order: [] };
      for (const a of action.agents) next = reducer(next, a);
      return next;
    }
    case 'clear':
      return { agents: {}, order: [] };
  }
}

function describe(ev: AgentEvent): string {
  if (ev.type === 'agent_remove') return `ลบ ${ev.sessionId.slice(0, 8)}`;
  if (ev.type === 'snapshot') return `snapshot ${ev.agents.length} agents`;
  const parts = [ev.sessionId.slice(0, 8)];
  if (ev.status) parts.push(`→ ${ev.status}`);
  if (ev.activity) parts.push(`[${ev.activity}]`);
  if (ev.file) parts.push(ev.file);
  if (ev.subAgents) parts.push(`sub×${ev.subAgents.length}`);
  return parts.join(' ');
}

// ============================================================
//  Simulator presets
// ============================================================
const TEAM = [
  { sessionId: 'sim-alpha', author: 'Nook', file: 'src/cart/Cart.tsx' },
  { sessionId: 'sim-beta', author: 'Ploy', file: 'src/api/checkout.ts' },
  { sessionId: 'sim-gamma', author: 'Ton', file: 'tests/checkout.spec.ts' },
];
const RANDOM_AUTHORS = ['Mint', 'Bank', 'Fah', 'Beam', 'Pond', 'June'];
const RANDOM_TASKS = ['Refactor auth', 'Fix CI pipeline', 'DB migration', 'Landing page', 'Perf review'];
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

const SOCKET_PILL: Record<SocketStatus, { label: string; color: string; pulse: boolean }> = {
  open: { label: 'Live', color: '#3DD6A3', pulse: true },
  connecting: { label: 'กำลังเชื่อมต่อ', color: '#F5B544', pulse: true },
  closed: { label: 'หลุด · ลองใหม่', color: '#FF6B6B', pulse: false },
  disabled: { label: 'Offline (simulator)', color: '#8B97AB', pulse: false },
};

export default function App() {
  const [store, dispatch] = useReducer(reducer, { agents: {}, order: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<AgentStatus | 'all'>('all');
  const [wsEnabled, setWsEnabled] = useState(true);
  const [soundOn, setSoundOn] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [scriptRunning, setScriptRunning] = useState(false);
  const scriptTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const logSeq = useRef(0);

  // ---------- จุดเดียวที่ event ทุกชนิดไหลผ่าน ----------
  const applyEvent = useCallback((ev: AgentEvent, source: LogEntry['source']) => {
    dispatch(ev);
    setLog((prev) =>
      [{ id: ++logSeq.current, time: new Date(), source, text: describe(ev) }, ...prev].slice(0, 40),
    );
  }, []);

  const socketStatus = useAgentSocket(WS_URL, wsEnabled, (ev) => applyEvent(ev, 'ws'));

  const agents = useMemo(
    () => store.order.map((id) => store.agents[id]).filter(Boolean),
    [store],
  );
  const groups = useMemo(() => computeCollabGroups(agents), [agents]);
  // โต๊ะประจำตัว: คงเดิมไว้ตลอดอายุ session (ตัวอื่นเข้า/ออกก็ไม่ต้องเดินย้ายโต๊ะ)
  const deskRef = useRef<Record<string, number>>({});
  const deskOf = useMemo(() => {
    const next = assignDesks(agents, deskRef.current);
    deskRef.current = next;
    return next;
  }, [agents]);
  const placements = useMemo(() => computePlacements(agents, groups, deskOf), [agents, groups, deskOf]);
  const deskStatus = useMemo(() => {
    const list: (AgentStatus | null)[] = DESKS.map(() => null);
    for (const a of agents) if (deskOf[a.sessionId] !== undefined) list[deskOf[a.sessionId]] = a.status;
    return list;
  }, [agents, deskOf]);
  const activeSpots = useMemo(() => new Set(groupSpots(groups).values()), [groups]);

  // ชุดแต่งตัวประจำตัว: คงเดิมตลอดอายุ session และไม่ซ้ำกับตัวอื่นในฉาก
  const outfitRef = useRef<Record<string, number>>({});
  const outfitOf = useMemo(() => {
    const next = assignOutfits(store.order, outfitRef.current);
    outfitRef.current = next;
    return next;
  }, [store.order]);

  // ---------- sub-agent: หุ่นจิ๋วที่ยืนทำงานข้างตัวแม่ (ใส่ชุดทีมเดียวกับตัวแม่) ----------
  const subPlacements = useMemo(() => computeSubPlacements(agents, placements), [agents, placements]);
  const minis = useMemo(
    () =>
      agents.flatMap((parent) =>
        parent.subAgents.map((sub) => {
          const activity: AgentActivity = sub.status === 'done' ? 'done' : subActivity(sub.type);
          const state: AgentState = {
            sessionId: subKey(parent.sessionId, sub.id),
            author: parent.author,
            task: sub.task,
            taskId: parent.taskId,
            file: '',
            status: ACTIVITY_STATUS[activity],
            activity,
            tool: '',
            updatedAt: parent.updatedAt,
            startedAt: parent.startedAt,
            steps: 0,
            history: [],
            subAgents: [],
          };
          return { parent, sub, state };
        }),
      ),
    [agents],
  );
  // AgentState ของหุ่นจิ๋วถูกสร้างใหม่ทุกครั้งที่ตัวแม่อัปเดต → เก็บ object เดิมไว้ถ้าเนื้อหาไม่เปลี่ยน (ให้ memo ทำงาน)
  const miniCache = useRef<Record<string, AgentState>>({});
  const miniStates = useMemo(() => {
    const next: Record<string, AgentState> = {};
    for (const { state } of minis) {
      const old = miniCache.current[state.sessionId];
      next[state.sessionId] =
        old && old.status === state.status && old.activity === state.activity && old.task === state.task ? old : state;
    }
    miniCache.current = next;
    return next;
  }, [minis]);

  const beams = useMemo(() => {
    const list: { key: string; from: string; to: string }[] = [];
    for (const ids of groups.values()) {
      const pairs = ids.length === 2 ? 1 : ids.length; // 2 ตัว = เส้นเดียว, ≥3 = ต่อเป็นวง
      for (let i = 0; i < pairs; i++) {
        const from = ids[i];
        const to = ids[(i + 1) % ids.length];
        list.push({ key: `${from}->${to}`, from, to });
      }
    }
    return list;
  }, [groups]);

  // ลำแสงสีชมพูจากตัวแม่ → sub-agent แต่ละตัว
  const subBeamKey = minis.map((m) => m.state.sessionId).join('|');
  const subBeams = useMemo(
    () => minis.map((m) => ({ key: m.state.sessionId, from: m.parent.sessionId, to: m.state.sessionId })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- เปลี่ยนเมื่อรายชื่อ sub-agent เปลี่ยนเท่านั้น
    [subBeamKey],
  );

  // ---------- Success jingle: เล่นตอน "เปลี่ยนเป็น" success เท่านั้น ----------
  const prevStatus = useRef<Record<string, AgentStatus>>({});
  useEffect(() => {
    let celebrate = false;
    for (const a of agents) {
      if (a.status === 'success' && prevStatus.current[a.sessionId] !== 'success') celebrate = true;
    }
    prevStatus.current = Object.fromEntries(agents.map((a) => [a.sessionId, a.status]));
    if (celebrate && soundOn) playSuccessJingle();
  }, [agents, soundOn]);

  // ---------- Mumble chatter: สลับคิวพูดในแต่ละกลุ่มทุก 4 วิ ----------
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  useEffect(() => {
    if (!soundOn) return;
    const turns = new Map<string, number>();
    const pending: ReturnType<typeof setTimeout>[] = [];

    const tick = () => {
      let stagger = 0;
      for (const [key, ids] of groupsRef.current) {
        const turn = turns.get(key) ?? 0;
        turns.set(key, turn + 1);
        const speaker = ids[turn % ids.length];
        const replier = ids[(turn + 1) % ids.length];
        // คนแรกพูด → อีกคนตอบหลังพูดจบ (คนละ pitch เพราะ pitch มาจาก hash ของ sessionId)
        pending.push(
          setTimeout(() => {
            const d = playMumble(speaker, voicePitchFor(speaker));
            pending.push(setTimeout(() => playMumble(replier, voicePitchFor(replier)), (d + 0.3) * 1000));
          }, stagger),
        );
        stagger += 700;
      }
    };

    tick();
    const interval = setInterval(tick, CHATTER_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      pending.forEach(clearTimeout);
    };
  }, [soundOn]);

  const toggleSound = async () => {
    if (soundOn) {
      setMuted(true);
      setSoundOn(false);
      return;
    }
    const ok = await unlockAudio();
    setMuted(false);
    setSoundOn(ok);
  };

  // ---------- Simulator actions ----------
  const sim = (ev: AgentEvent) => applyEvent(ev, 'sim');

  const stopScript = () => {
    scriptTimers.current.forEach(clearTimeout);
    scriptTimers.current = [];
    setScriptRunning(false);
  };

  const createTeam = () => {
    TEAM.forEach((m) =>
      sim({ type: 'agent_update', ...m, task: 'Checkout Revamp', taskId: SHARED_TASK_ID, status: 'idle' }),
    );
  };

  const runScript = () => {
    stopScript();
    createTeam();
    setScriptRunning(true);
    const [alpha, beta, gamma] = TEAM.map((m) => m.sessionId);
    // [เวลา ms, session, status, file?, activity?] — activity ที่ไม่ระบุใช้ค่าเริ่มต้นของ status
    const steps: [number, string, AgentStatus, string?, AgentActivity?][] = [
      [1000, alpha, 'thinking', 'src/cart', 'reading'],
      [1200, beta, 'thinking', 'checkout', 'searching'],
      [2800, alpha, 'coding', 'src/cart/Cart.tsx', 'writing'],
      [3200, beta, 'thinking', 'https://docs.stripe.com', 'web'],
      [4200, beta, 'coding', '$ npm run build', 'running'],
      [5200, beta, 'coding', 'src/api/checkout.ts', 'writing'],
      [6500, gamma, 'testing', 'tests/checkout.spec.ts'],
      [11000, gamma, 'error', 'tests/checkout.spec.ts'],
      [13000, gamma, 'testing', 'tests/checkout.spec.ts'],
      [16000, beta, 'success'],
      [17500, alpha, 'testing', 'tests/cart.spec.ts'],
      [20500, alpha, 'success'],
      [21000, gamma, 'success'],
      [24000, alpha, 'idle', 'ขออนุญาตรัน npm publish', 'waiting'],
      [27000, alpha, 'idle', '', 'idle'],
      [27000, beta, 'idle'],
      [27000, gamma, 'idle'],
    ];
    scriptTimers.current = steps.map(([ms, id, status, file, activity]) =>
      setTimeout(
        () =>
          sim({
            type: 'agent_update',
            sessionId: id,
            status,
            ...(file !== undefined ? { file } : {}),
            ...(activity ? { activity } : {}),
          }),
        ms,
      ),
    );
    // alpha เรียก sub-agent 2 ตัวมาช่วยสำรวจ/วางแผน แล้วทยอยทำเสร็จ; gamma เรียกตัวช่วยรันเทสต์
    const subSteps: [number, () => void][] = [
      [1600, () => spawnSub(alpha, 'Explore', 'สำรวจโค้ดตะกร้าสินค้า')],
      [2100, () => spawnSub(alpha, 'Plan', 'วางแผน refactor Cart')],
      [7000, () => spawnSub(gamma, 'test-runner', 'รัน e2e checkout')],
      [8500, () => finishSub(alpha)],
      [10500, () => finishSub(alpha)],
      [15000, () => finishSub(gamma)],
    ];
    scriptTimers.current.push(...subSteps.map(([ms, fn]) => setTimeout(fn, ms)));
    scriptTimers.current.push(setTimeout(() => setScriptRunning(false), 27200));
  };

  const addRandom = () => {
    const id = `sim-${Math.random().toString(36).slice(2, 8)}`;
    const task = pick(RANDOM_TASKS);
    sim({ type: 'agent_update', sessionId: id, author: pick(RANDOM_AUTHORS), task, taskId: task, status: 'idle' });
  };

  const setStatus = (sessionId: string, status: AgentStatus) => sim({ type: 'agent_update', sessionId, status });

  const setActivity = (sessionId: string, activity: AgentActivity) =>
    sim({ type: 'agent_update', sessionId, activity });

  const toggleTask = (a: AgentState) => {
    const joining = a.taskId !== SHARED_TASK_ID;
    sim({
      type: 'agent_update',
      sessionId: a.sessionId,
      taskId: joining ? SHARED_TASK_ID : `solo-${a.sessionId}`,
      task: joining ? 'Checkout Revamp' : `${a.author}'s side task`,
    });
  };

  // ---------- sub-agent (simulator): เรียกเพิ่ม / ทำเสร็จทีละตัว ----------
  const agentsRef = useRef(store.agents);
  agentsRef.current = store.agents;
  const subTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const subSeq = useRef(0);

  const spawnSub = (sessionId: string, type = pick(SIM_SUB_TYPES), task = pick(SIM_SUB_TASKS)) => {
    const a = agentsRef.current[sessionId];
    if (!a) return;
    const sub: SubAgentInfo = { id: `s${++subSeq.current}`, type, task, status: 'running' };
    sim({
      type: 'agent_update',
      sessionId,
      activity: 'delegating',
      tool: 'Agent',
      file: `${type}: ${task}`,
      subAgents: [...a.subAgents, sub].slice(-MAX_SUB_AGENTS),
    });
  };

  const finishSub = (sessionId: string) => {
    const a = agentsRef.current[sessionId];
    const target = a?.subAgents.find((s) => s.status === 'running');
    if (!a || !target) return;
    sim({
      type: 'agent_update',
      sessionId,
      subAgents: a.subAgents.map((s) => (s.id === target.id ? { ...s, status: 'done' as const } : s)),
    });
    // ฉลองแป๊บหนึ่ง แล้วหายไป
    subTimers.current.push(
      setTimeout(() => {
        const cur = agentsRef.current[sessionId];
        if (!cur?.subAgents.some((s) => s.id === target.id)) return;
        sim({ type: 'agent_update', sessionId, subAgents: cur.subAgents.filter((s) => s.id !== target.id) });
      }, SUB_DONE_MS),
    );
  };

  const clearAll = () => {
    stopScript();
    subTimers.current.forEach(clearTimeout);
    subTimers.current = [];
    dispatch({ type: 'clear' });
    setSelectedId(null);
  };

  useEffect(
    () => () => {
      scriptTimers.current.forEach(clearTimeout);
      subTimers.current.forEach(clearTimeout);
    },
    [],
  );

  const counts = useMemo(() => {
    const c = Object.fromEntries(AGENT_STATUSES.map((s) => [s, 0])) as Record<AgentStatus, number>;
    agents.forEach((a) => c[a.status]++);
    return c;
  }, [agents]);

  const collabIds = useMemo(() => new Set([...groups.values()].flat()), [groups]);
  const peopleCount = useMemo(() => new Set(agents.map((a) => a.author)).size, [agents]);
  // แผงรายละเอียดแสดงตัวที่เลือก; ถ้ายังไม่ได้เลือกให้โชว์ตัวแรก (เหมือน design)
  const panelAgent = agents.find((a) => a.sessionId === selectedId) ?? agents[0];
  const panelIndex = panelAgent ? agents.indexOf(panelAgent) + 1 : 0;
  const live = SOCKET_PILL[socketStatus];

  const filterPills: { key: AgentStatus | 'all'; label: string; color: string; count: number }[] = [
    { key: 'all', label: 'ทั้งหมด', color: '#E6EBF2', count: agents.length },
    ...AGENT_STATUSES.map((s) => ({ key: s, label: STATUS_META[s].label, color: STATUS_META[s].color, count: counts[s] })),
  ];

  return (
    <div className="min-h-screen bg-[#0B0F17] px-[clamp(16px,3vw,40px)] pb-12 pt-7 text-[#E6EBF2]">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
        {/* ===================== Header ===================== */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="font-mono text-xs tracking-[0.08em] text-[#93A0B4]">CLAUDE CODE · LOCAL</div>
            <h1 className="m-0 text-[32px] font-bold leading-tight tracking-[-0.01em]">Agent Floor</h1>
            <p className="m-0 text-[15px] text-[#93A0B4]">
              ห้องทำงาน + ห้องพักผ่อน 3 มิติของ agent — ดูว่าแต่ละ session กำลังทำอะไร เรียก sub-agent กี่ตัว และใครเป็นคนสั่ง
            </p>
          </div>
          <div className="flex items-center gap-2.5 rounded-full border border-[#263247] bg-[#131A26] px-3.5 py-2 text-[13px] text-[#B7C2D3]">
            <span
              className={`inline-block h-2 w-2 rounded-full ${live.pulse ? 'animate-pulse' : ''}`}
              style={{ background: live.color }}
            />
            <span>
              {live.label} · {agents.length} sessions · {peopleCount} คน
            </span>
          </div>
        </header>

        {/* ===================== ตัวกรองสถานะ ===================== */}
        <nav aria-label="กรองตามสถานะ" className="flex flex-wrap gap-2">
          {filterPills.map((p) => {
            const active = filter === p.key;
            return (
              <button
                type="button"
                key={p.key}
                onClick={() => setFilter(p.key)}
                aria-pressed={active}
                className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-medium transition ${
                  active
                    ? 'border-[#E6EBF2] bg-[#E6EBF2] text-[#0B0F17]'
                    : 'border-[#263247] bg-[#131A26] text-[#E6EBF2] hover:border-[#3A4864]'
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: p.key === 'all' && active ? '#0B0F17' : p.color }}
                />
                <span>{p.label}</span>
                <span className="font-mono text-xs opacity-75">{p.count}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex flex-wrap items-start gap-5">
      {/* ===================== 3D Scene ===================== */}
      <section
        aria-label="ห้องทำงาน 3 มิติ"
        className="min-w-0 flex-[999_1_640px] overflow-hidden rounded-[18px] border border-[#263247] bg-[#0F141E]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2838] px-[18px] py-3.5">
          <div className="text-sm font-semibold">ฉาก 3 มิติ · {agents.length} agents</div>
          <div className="text-[13px] text-[#93A0B4]">คลิกที่หุ่นเพื่อดูรายละเอียด · ลากเพื่อหมุนกล้อง · คลิกขวาลากเพื่อเลื่อน</div>
        </div>
        <div className="relative h-[min(660px,72vh)] min-h-[420px]">
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [-4, 13, 20.5], fov: 45 }}
          onPointerMissed={() => setSelectedId(null)}
        >
          <color attach="background" args={['#0F141E']} />
          <fog attach="fog" args={['#0F141E', 38, 80]} />
          <ambientLight intensity={0.55} />
          <hemisphereLight args={['#bcd7ff', '#1a2236', 0.7]} />
          <directionalLight
            position={[6, 14, 9]}
            intensity={1.5}
            castShadow
            shadow-mapSize={[4096, 4096]}
            shadow-camera-left={-22}
            shadow-camera-right={14}
            shadow-camera-top={14}
            shadow-camera-bottom={-14}
            shadow-bias={-0.0005}
          />
          <Stars radius={80} depth={40} count={1800} factor={3} fade speed={0.6} />

          <Office deskStatus={deskStatus} activeSpots={activeSpots} />

          {agents.map((a) => (
            <Agent3D
              key={a.sessionId}
              agent={a}
              placement={placements[a.sessionId]}
              outfit={OUTFITS[outfitOf[a.sessionId] ?? 0]}
              selected={selectedId === a.sessionId}
              dimmed={filter !== 'all' && a.status !== filter}
              onSelect={setSelectedId}
            />
          ))}
          {minis.map(({ parent, sub, state }) => (
            <Agent3D
              key={state.sessionId}
              mini
              agent={miniStates[state.sessionId] ?? state}
              subType={sub.type}
              placement={subPlacements[state.sessionId]}
              outfit={OUTFITS[outfitOf[parent.sessionId] ?? 0]}
              spawnAt={placements[parent.sessionId]?.position}
              selectId={parent.sessionId}
              selected={false}
              dimmed={filter !== 'all' && parent.status !== filter}
              onSelect={setSelectedId}
            />
          ))}
          {beams.map((b) => (
            <CollabBeam key={b.key} fromId={b.from} toId={b.to} />
          ))}
          {subBeams.map((b) => (
            <CollabBeam key={b.key} fromId={b.from} toId={b.to} color={SUB_BEAM_COLOR} />
          ))}

          <OrbitControls
            makeDefault
            target={[-4, 0.8, 0]}
            minDistance={5}
            maxDistance={42}
            maxPolarAngle={Math.PI / 2.1}
          />
        </Canvas>

        {/* Overlay: กลุ่มร่วมงาน */}
        <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2">
          {groups.size > 0 && (
            <div className="flex w-fit items-center gap-1.5 rounded-full bg-cyan-500/15 px-2.5 py-1 text-[11px] text-cyan-300">
              <Radio size={12} className="animate-pulse" />
              {groups.size} กลุ่มกำลังร่วมงาน · {[...groups.values()].reduce((n, g) => n + g.length, 0)} agents
            </div>
          )}
        </div>

        {agents.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-sm rounded-2xl border border-white/10 bg-slate-900/70 p-5 text-center text-sm text-slate-300 backdrop-blur">
              ยังไม่มี Agent ในฉาก — รอ event จาก <span className="font-mono text-sky-300">{WS_URL}</span>
              <br />
              หรือกด <b className="text-white">“เล่นสคริปต์ทีม 3 ตัว”</b> ที่แผงด้านขวา
            </div>
          </div>
        )}
        </div>
        <div className="flex flex-wrap gap-x-[18px] gap-y-2 border-t border-[#1E2838] px-[18px] pb-4 pt-3 text-[12.5px] text-[#93A0B4]">
          <span className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#38bdf8] shadow-[0_0_8px_#38bdf8]" />
            ไฟเสาอากาศ = สถานะ session
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-3.5 rounded-sm bg-[#E8956A]" />
            สีหู/ไหล่ = คนสั่งงาน
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-0 w-5 border-t-2 border-dashed border-[#67e8f9]" />
            ลำแสง = กำลังร่วมงาน task เดียวกัน
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-0 w-5 border-t-2 border-dashed border-[#e879f9]" />
            หุ่นจิ๋ว + ลำแสงชมพู = sub-agent
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-3.5 rounded-sm bg-[#7c3aed]" />
            ชุดแต่งตัว = ประจำตัวแต่ละ session
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-[18px] rounded-full border-2 border-[#E6EBF2]" />
            วงขาว = session ที่เลือก
          </span>
        </div>
      </section>

      {/* ===================== แผงขวา: รายละเอียด + Simulator ===================== */}
      <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
      <DetailPanel
        agent={panelAgent}
        outfitName={panelAgent ? OUTFITS[outfitOf[panelAgent.sessionId] ?? 0].name : ''}
        n={panelIndex}
        inCollab={!!panelAgent && collabIds.has(panelAgent.sessionId)}
        onSetStatus={setStatus}
        onRemove={(id) => sim({ type: 'agent_remove', sessionId: id })}
      />
      <SimulatorPanel
        agents={agents}
        selectedId={selectedId}
        onSelect={setSelectedId}
        wsUrl={WS_URL}
        socketStatus={socketStatus}
        wsEnabled={wsEnabled}
        onToggleWs={() => setWsEnabled((v) => !v)}
        soundOn={soundOn}
        onToggleSound={toggleSound}
        scriptRunning={scriptRunning}
        onRunScript={runScript}
        onStopScript={stopScript}
        onCreateTeam={createTeam}
        onAddRandom={addRandom}
        onClear={clearAll}
        onSetStatus={setStatus}
        onSetActivity={setActivity}
        onSpawnSub={(id) => spawnSub(id)}
        onFinishSub={finishSub}
        onToggleTask={toggleTask}
        onRemove={(id) => sim({ type: 'agent_remove', sessionId: id })}
        onCustomEvent={sim}
        sharedTaskId={SHARED_TASK_ID}
        collabIds={collabIds}
        log={log}
      />
      </aside>
        </div>

        <SessionTable agents={agents} selectedId={panelAgent?.sessionId ?? null} filter={filter} onSelect={setSelectedId} />
      </div>
    </div>
  );
}
