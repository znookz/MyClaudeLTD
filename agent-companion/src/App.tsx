import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Grid, OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { Bot, Radio } from 'lucide-react';
import Agent3D from './Agent3D';
import CollabBeam from './CollabBeam';
import SimulatorPanel, { type LogEntry } from './components/SimulatorPanel';
import { useAgentSocket } from './hooks/useAgentSocket';
import {
  AGENT_STATUSES,
  STATUS_META,
  type AgentEvent,
  type AgentState,
  type AgentStatus,
  type AgentUpdateEvent,
} from './types';
import { computeCollabGroups, computePlacements } from './utils/layout';
import { playMumble, playSuccessJingle, setMuted, unlockAudio, voicePitchFor } from './utils/sound';

const WS_URL: string = import.meta.env.VITE_AGENT_WS ?? 'ws://localhost:8080';
const CHATTER_INTERVAL_MS = 4000;
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

function mergeAgent(prev: AgentState | undefined, ev: AgentUpdateEvent): AgentState {
  return {
    sessionId: ev.sessionId,
    author: ev.author ?? prev?.author ?? 'unknown',
    task: ev.task ?? prev?.task ?? 'Untitled task',
    taskId: ev.taskId ?? prev?.taskId ?? ev.task ?? 'default',
    file: ev.file ?? prev?.file ?? '',
    status: ev.status ?? prev?.status ?? 'idle',
    updatedAt: Date.now(),
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
  if (ev.file) parts.push(ev.file);
  return parts.join(' ');
}

// ============================================================
//  ฉาก: จุดรวมพลตรงกลาง (เรืองแสงเมื่อมีกลุ่มร่วมงาน)
// ============================================================
function CollabZone({ active }: { active: boolean }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((state) => {
    if (!mat.current) return;
    const target = active ? 0.35 + Math.sin(state.clock.elapsedTime * 3) * 0.15 : 0.08;
    mat.current.opacity += (target - mat.current.opacity) * 0.05;
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0.8]}>
      <ringGeometry args={[1.9, 2.0, 96]} />
      <meshBasicMaterial ref={mat} color="#67e8f9" transparent opacity={0.08} depthWrite={false} />
    </mesh>
  );
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

export default function App() {
  const [store, dispatch] = useReducer(reducer, { agents: {}, order: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const placements = useMemo(() => computePlacements(agents, groups), [agents, groups]);

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
    const steps: [number, string, AgentStatus, string?][] = [
      [1000, alpha, 'thinking'],
      [1200, beta, 'thinking'],
      [2800, alpha, 'coding', 'src/cart/Cart.tsx'],
      [3200, beta, 'coding', 'src/api/checkout.ts'],
      [6500, gamma, 'testing', 'tests/checkout.spec.ts'],
      [11000, gamma, 'error', 'tests/checkout.spec.ts'],
      [13000, gamma, 'testing', 'tests/checkout.spec.ts'],
      [16000, beta, 'success'],
      [17500, alpha, 'testing', 'tests/cart.spec.ts'],
      [20500, alpha, 'success'],
      [21000, gamma, 'success'],
      [27000, alpha, 'idle'],
      [27000, beta, 'idle'],
      [27000, gamma, 'idle'],
    ];
    scriptTimers.current = steps.map(([ms, id, status, file]) =>
      setTimeout(() => sim({ type: 'agent_update', sessionId: id, status, ...(file ? { file } : {}) }), ms),
    );
    scriptTimers.current.push(setTimeout(() => setScriptRunning(false), 27200));
  };

  const addRandom = () => {
    const id = `sim-${Math.random().toString(36).slice(2, 8)}`;
    const task = pick(RANDOM_TASKS);
    sim({ type: 'agent_update', sessionId: id, author: pick(RANDOM_AUTHORS), task, taskId: task, status: 'idle' });
  };

  const setStatus = (sessionId: string, status: AgentStatus) => sim({ type: 'agent_update', sessionId, status });

  const toggleTask = (a: AgentState) => {
    const joining = a.taskId !== SHARED_TASK_ID;
    sim({
      type: 'agent_update',
      sessionId: a.sessionId,
      taskId: joining ? SHARED_TASK_ID : `solo-${a.sessionId}`,
      task: joining ? 'Checkout Revamp' : `${a.author}'s side task`,
    });
  };

  const clearAll = () => {
    stopScript();
    dispatch({ type: 'clear' });
    setSelectedId(null);
  };

  useEffect(() => () => scriptTimers.current.forEach(clearTimeout), []);

  const counts = useMemo(() => {
    const c = Object.fromEntries(AGENT_STATUSES.map((s) => [s, 0])) as Record<AgentStatus, number>;
    agents.forEach((a) => c[a.status]++);
    return c;
  }, [agents]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#050810] text-slate-100 md:flex-row">
      {/* ===================== 3D Scene ===================== */}
      <main className="relative min-h-[55vh] flex-1">
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, 4.8, 11], fov: 45 }}
          onPointerMissed={() => setSelectedId(null)}
        >
          <color attach="background" args={['#050810']} />
          <fog attach="fog" args={['#050810', 16, 34]} />
          <ambientLight intensity={0.45} />
          <hemisphereLight args={['#bcd7ff', '#0b1020', 0.6]} />
          <directionalLight position={[5, 9, 6]} intensity={1.5} castShadow shadow-mapSize={[1024, 1024]} />
          <Stars radius={70} depth={40} count={1800} factor={3} fade speed={0.6} />

          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[60, 60]} />
            <shadowMaterial opacity={0.35} />
          </mesh>
          <Grid
            infiniteGrid
            cellSize={0.6}
            sectionSize={3}
            cellThickness={0.6}
            sectionThickness={1}
            cellColor="#1e293b"
            sectionColor="#334155"
            fadeDistance={30}
            fadeStrength={1.5}
          />
          <CollabZone active={groups.size > 0} />

          {agents.map((a) => (
            <Agent3D
              key={a.sessionId}
              agent={a}
              placement={placements[a.sessionId]}
              selected={selectedId === a.sessionId}
              onSelect={setSelectedId}
            />
          ))}
          {beams.map((b) => (
            <CollabBeam key={b.key} fromId={b.from} toId={b.to} />
          ))}

          <OrbitControls
            makeDefault
            target={[0, 1.4, 0]}
            enablePan={false}
            minDistance={5}
            maxDistance={22}
            maxPolarAngle={Math.PI / 2.1}
          />
        </Canvas>

        {/* Overlay: หัวเรื่อง + สถานะการเชื่อมต่อ */}
        <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Bot size={20} className="text-sky-400" /> Agent Companion 3D
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {AGENT_STATUSES.map((s) => (
              <span
                key={s}
                className="flex items-center gap-1 rounded-full border border-white/10 bg-slate-900/70 px-2 py-0.5"
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_META[s].color }} />
                {STATUS_META[s].label} {counts[s]}
              </span>
            ))}
          </div>
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
      </main>

      {/* ===================== Sidebar ===================== */}
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
        onToggleTask={toggleTask}
        onRemove={(id) => sim({ type: 'agent_remove', sessionId: id })}
        onCustomEvent={sim}
        sharedTaskId={SHARED_TASK_ID}
        collabIds={new Set([...groups.values()].flat())}
        log={log}
      />
    </div>
  );
}
