import { memo, useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SKY, useSceneSettings, useTod } from "./utils/sceneSettings";
import { LOUNGE, ROOM } from './utils/office';

// ============================================================
//  สภาพแวดล้อมนอกอาคาร: ถนนหน้าตึก · ทางเท้า · เสาไฟ · ต้นไม้ · ตึกไกล ๆ
//  มีรถวิ่งผ่านและคนเดินไปมา (ทั้งหมดเป็นของตกแต่ง ไม่เกี่ยวกับ pathfinding ของ Agent)
// ============================================================

/** random แบบมี seed → ฉากหน้าตาเหมือนเดิมทุกครั้งที่โหลด */
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];

// แนวถนน (ตามแกน x) อยู่ด้านหน้าอาคาร (+z)
const WALK_Z0 = ROOM.maxZ; // 5.5 ขอบอาคาร
const WALK_Z1 = 10.3; // ทางเท้ากว้าง ๆ หน้าอาคาร ห่างจากถนน
const ROAD_Z0 = WALK_Z1;
const ROAD_Z1 = 15.3;
const FAR_Z1 = 17.2;
const LANE_A = 11.55; // รถวิ่งไปทาง +x
const LANE_B = 14.05; // รถวิ่งไปทาง -x
const MID_X = (ROOM.maxX + LOUNGE.minX) / 2; // กลางอาคาร (-4)
const STRIP = 150; // ความยาวถนน/ทางเท้า
const SPAN = 100; // รถวนกลับมาใหม่ในช่วง x = -54..46
const SPAN_X0 = MID_X - SPAN / 2;

// ---------- texture แสงฟุ้ง (ใช้ซ้ำทั้งไฟหน้ารถและไฟถนน) ----------
let glowTexCache: THREE.CanvasTexture | null = null;
function glowTex() {
  if (glowTexCache) return glowTexCache;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTexCache = new THREE.CanvasTexture(c);
  return glowTexCache;
}

function GroundGlow({
  position,
  size,
  color,
  opacity,
}: {
  position: [number, number, number];
  size: [number, number];
  color: string;
  opacity: number;
}) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={position}>
      <planeGeometry args={size} />
      <meshBasicMaterial
        map={glowTex()}
        color={color}
        transparent
        opacity={opacity}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

// ============================================================
//  พื้น · ถนน · ทางเท้า
// ============================================================
/** ปูอิฐทางเท้า: อิฐสี่เหลี่ยมวางสลับแถว โทนพีช/ชมพู/ครีมนุ่ม ๆ (วาดด้วย canvas) */
function Pavers({ x, z, w, d, y = 0.063 }: { x: number; z: number; w: number; d: number; y?: number }) {
  const tex = useMemo(() => {
    const r = mulberry(Math.round(w * 7 + d * 13));
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f6e3df'; // ร่องอิฐ
    g.fillRect(0, 0, 128, 128);
    const tones = ['#f9d9cf', '#fbe4d6', '#f4cfcf', '#fdeadf', '#f7d6dc'];
    const bw = 32;
    const bh = 16;
    for (let row = 0; row < 8; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let col = -1; col < 4; col++) {
        g.fillStyle = pick(r, tones);
        g.fillRect(col * bw + off + 1.5, row * bh + 1.5, bw - 3, bh - 3);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(w / 1.6, d / 1.6);
    t.anisotropy = 8;
    return t;
  }, [w, d]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, y, z]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial map={tex} roughness={0.9} />
    </mesh>
  );
}

function Roads() {
  const dashes = useMemo(() => {
    const out: number[] = [];
    for (let x = MID_X - STRIP / 2; x < MID_X + STRIP / 2; x += 3.2) out.push(x);
    return out;
  }, []);
  const zebra = useMemo(() => Array.from({ length: 6 }, (_, i) => ROAD_Z0 + 0.45 + i * 0.84), []);
  const CROSS_X = 4.2;
  return (
    <group>
      {/* หญ้า/พื้นรอบนอก */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[MID_X, -0.05, 0]} receiveShadow>
        <planeGeometry args={[220, 220]} />
        <meshStandardMaterial color="#cfe8d3" roughness={1} />
      </mesh>
      {/* ทางเท้าหน้าอาคาร: ขอบคันหินสีกุหลาบ + ปูอิฐลายก้างปลาสีพีช */}
      <mesh position={[MID_X, 0, (WALK_Z0 + WALK_Z1) / 2]} receiveShadow>
        <boxGeometry args={[STRIP, 0.12, WALK_Z1 - WALK_Z0]} />
        <meshStandardMaterial color="#e3b8c0" roughness={0.9} />
      </mesh>
      <Pavers x={MID_X} z={(WALK_Z0 + WALK_Z1) / 2} w={STRIP - 0.2} d={WALK_Z1 - WALK_Z0 - 0.3} />
      {/* ทางเดินจากประตูข้างอาคารมาเชื่อมทางเท้า */}
      <mesh position={[9.4, 0, (3.0 + WALK_Z1) / 2]} receiveShadow>
        <boxGeometry args={[1.9, 0.12, WALK_Z1 - 3.0]} />
        <meshStandardMaterial color="#e3b8c0" roughness={0.9} />
      </mesh>
      <Pavers x={9.4} z={(3.0 + WALK_Z1) / 2} w={1.7} d={WALK_Z1 - 3.0 - 0.2} y={0.065} />
      {/* ถนน */}
      <mesh position={[MID_X, 0, (ROAD_Z0 + ROAD_Z1) / 2]} receiveShadow>
        <boxGeometry args={[STRIP, 0.04, ROAD_Z1 - ROAD_Z0]} />
        <meshStandardMaterial color="#b9b4c6" roughness={0.95} />
      </mesh>
      {/* ทางเท้าฝั่งตรงข้าม */}
      <mesh position={[MID_X, 0, (ROAD_Z1 + FAR_Z1) / 2]} receiveShadow>
        <boxGeometry args={[STRIP, 0.12, FAR_Z1 - ROAD_Z1]} />
        <meshStandardMaterial color="#e3b8c0" roughness={0.9} />
      </mesh>
      <Pavers x={MID_X} z={(ROAD_Z1 + FAR_Z1) / 2} w={STRIP - 0.2} d={FAR_Z1 - ROAD_Z1 - 0.3} />
      {/* เส้นขอบถนน + เส้นแบ่งเลนประ */}
      {[ROAD_Z0 + 0.3, ROAD_Z1 - 0.3].map((z) => (
        <mesh key={z} position={[MID_X, 0.026, z]}>
          <boxGeometry args={[STRIP, 0.006, 0.1]} />
          <meshStandardMaterial color="#ffffff" roughness={0.8} />
        </mesh>
      ))}
      {dashes.map((x) => (
        <mesh key={x} position={[x, 0.026, (LANE_A + LANE_B) / 2]}>
          <boxGeometry args={[1.6, 0.006, 0.13]} />
          <meshStandardMaterial color="#fde68a" roughness={0.8} />
        </mesh>
      ))}
      {/* ทางม้าลาย */}
      {zebra.map((z) => (
        <mesh key={z} position={[CROSS_X, 0.027, z]}>
          <boxGeometry args={[3.2, 0.006, 0.45]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

// ============================================================
//  เสาไฟถนน · ป้ายรถเมล์
// ============================================================
function Lamp({ x }: { x: number }) {
  const lamp = SKY[useTod()].lamp;
  return (
    <group position={[x, 0.06, WALK_Z1 - 0.3]}>
      <mesh position={[0, 2.1, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 4.2, 8]} />
        <meshStandardMaterial color="#8b7f9c" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, 4.2, 0.55]}>
        <boxGeometry args={[0.07, 0.07, 1.2]} />
        <meshStandardMaterial color="#8b7f9c" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, 4.14, 1.05]}>
        <boxGeometry args={[0.28, 0.07, 0.5]} />
        <meshStandardMaterial color="#ffe2a8" emissive="#ffd28a" emissiveIntensity={0.5 + 2.4 * lamp} toneMapped={false} />
      </mesh>
      <GroundGlow position={[0, 0.0, 1.2]} size={[6.5, 6.5]} color="#ffcf80" opacity={0.04 + 0.3 * lamp} />
    </group>
  );
}

function BusStop({ x }: { x: number }) {
  return (
    <group position={[x, 0.06, WALK_Z1 - 0.75]}>
      {[-1.2, 1.2].map((px) => (
        <mesh key={px} position={[px, 1.2, -0.4]}>
          <boxGeometry args={[0.06, 2.4, 0.06]} />
          <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 2.43, 0]} castShadow>
        <boxGeometry args={[2.8, 0.08, 1.1]} />
        <meshStandardMaterial color="#334155" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.25, -0.42]}>
        <boxGeometry args={[2.4, 2.0, 0.03]} />
        <meshStandardMaterial color="#9fd8ff" transparent opacity={0.18} roughness={0.1} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.45, -0.2]}>
        <boxGeometry args={[1.8, 0.07, 0.35]} />
        <meshStandardMaterial color="#8a6a47" roughness={0.7} />
      </mesh>
      {/* ป้ายไฟ */}
      <mesh position={[1.45, 1.7, -0.1]}>
        <boxGeometry args={[0.04, 0.9, 0.55]} />
        <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={1.8} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ============================================================
//  รถ: วิ่งวนเป็นลูป  ตัวรถวาดให้ +x = ด้านหน้า แล้วหมุนตามทิศเลน
// ============================================================
const CAR_COLORS = ['#ef4444', '#3b82f6', '#f5b544', '#e2e8f0', '#22c55e', '#a78bfa', '#f97316', '#0ea5a4'] as const;

interface VehicleCfg {
  kind: 'sedan' | 'bus';
  color: string;
  dir: 1 | -1;
  speed: number;
  offset: number;
}

function Wheels({ xs, z, r = 0.34 }: { xs: number[]; z: number; r?: number }) {
  return (
    <>
      {xs.flatMap((x) =>
        [-1, 1].map((s) => (
          <mesh key={`${x}${s}`} position={[x, r, s * z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[r, r, 0.26, 14]} />
            <meshStandardMaterial color="#0b0f17" roughness={0.9} />
          </mesh>
        )),
      )}
    </>
  );
}

function Lights({ front, rear, h, w }: { front: number; rear: number; h: number; w: number }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <mesh key={`f${s}`} position={[front, h, s * w]}>
          <boxGeometry args={[0.06, 0.14, 0.3]} />
          <meshStandardMaterial color="#fffbe6" emissive="#fff3c4" emissiveIntensity={3} toneMapped={false} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`r${s}`} position={[rear, h, s * w]}>
          <boxGeometry args={[0.06, 0.12, 0.3]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2.4} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

function Sedan({ color }: { color: string }) {
  const lamp = SKY[useTod()].lamp;
  return (
    <group>
      <mesh position={[0, 0.58, 0]} castShadow>
        <boxGeometry args={[4.2, 0.6, 1.8]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.35} />
      </mesh>
      <mesh position={[-0.2, 1.12, 0]} castShadow>
        <boxGeometry args={[2.3, 0.5, 1.6]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.35} />
      </mesh>
      {/* กระจก */}
      <mesh position={[-0.2, 1.14, 0]}>
        <boxGeometry args={[2.34, 0.34, 1.64]} />
        <meshStandardMaterial color="#0b1424" roughness={0.1} metalness={0.5} />
      </mesh>
      <Wheels xs={[-1.3, 1.3]} z={0.85} />
      <Lights front={2.1} rear={-2.1} h={0.62} w={0.62} />
      <GroundGlow position={[4.4, 0.03, 0]} size={[5.2, 2.6]} color="#fff1bd" opacity={0.08 + 0.3 * lamp} />
    </group>
  );
}

function Bus({ color }: { color: string }) {
  const lamp = SKY[useTod()].lamp;
  return (
    <group>
      <mesh position={[0, 1.3, 0]} castShadow>
        <boxGeometry args={[9, 1.8, 2.2]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[-0.2, 1.62, 0]}>
        <boxGeometry args={[8.2, 0.6, 2.24]} />
        <meshStandardMaterial color="#fde68a" emissive="#fbd38d" emissiveIntensity={0.9} toneMapped={false} />
      </mesh>
      <mesh position={[4.52, 1.62, 0]}>
        <boxGeometry args={[0.04, 0.65, 1.9]} />
        <meshStandardMaterial color="#0b1424" roughness={0.1} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[9, 0.3, 2.2]} />
        <meshStandardMaterial color="#1b2333" roughness={0.8} />
      </mesh>
      <Wheels xs={[-3.0, 3.0]} z={1.0} r={0.42} />
      <Lights front={4.5} rear={-4.5} h={0.8} w={0.85} />
      <GroundGlow position={[7.2, 0.03, 0]} size={[6, 3.4]} color="#fff1bd" opacity={0.08 + 0.3 * lamp} />
    </group>
  );
}

function Vehicle({ cfg, laneZ }: { cfg: VehicleCfg; laneZ: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!g.current) return;
    const t = state.clock.elapsedTime;
    const p = (((cfg.offset + cfg.dir * cfg.speed * t) % SPAN) + SPAN) % SPAN;
    g.current.position.x = SPAN_X0 + p;
  });
  return (
    <group ref={g} position={[SPAN_X0, 0.02, laneZ]} rotation={[0, cfg.dir > 0 ? 0 : Math.PI, 0]}>
      {cfg.kind === 'bus' ? <Bus color={cfg.color} /> : <Sedan color={cfg.color} />}
    </group>
  );
}

function Traffic() {
  const { low } = useSceneSettings();
  const cars = useMemo(() => {
    const r = mulberry(11);
    const out: (VehicleCfg & { lane: number })[] = [];
    const build = (dir: 1 | -1, lane: number, speed: number, n: number, busAt: number) => {
      for (let i = 0; i < n; i++) {
        out.push({
          kind: i === busAt ? 'bus' : 'sedan',
          color: i === busAt ? pick(r, ['#ef4444', '#38bdf8']) : pick(r, CAR_COLORS),
          dir,
          speed,
          lane,
          offset: (i * SPAN) / n + (r() - 0.5) * 6,
        });
      }
    };
    build(1, LANE_A, 5.2, low ? 2 : 3, 1);
    build(-1, LANE_B, 4.4, low ? 1 : 2, 0);
    return out;
  }, [low]);
  return (
    <group>
      {cars.map((c, i) => (
        <Vehicle key={i} cfg={c} laneZ={c.lane} />
      ))}
    </group>
  );
}

// ============================================================
//  คนเดิน: เดินไปมาตามทางเท้าทั้งสองฝั่ง แกว่งแขนขา
// ============================================================
interface WalkerCfg {
  z: number;
  dir: 1 | -1;
  speed: number;
  offset: number;
  shirt: string;
  pants: string;
  skin: string;
  hair: string;
  scale: number;
  phase: number;
}

const WALK_SPAN = 80;
const WALK_X0 = MID_X - WALK_SPAN / 2;

function Walker({ cfg }: { cfg: WalkerCfg }) {
  const g = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!g.current) return;
    const t = state.clock.elapsedTime;
    const d = cfg.speed * t;
    const p = (((cfg.offset + cfg.dir * d) % WALK_SPAN) + WALK_SPAN) % WALK_SPAN;
    g.current.position.x = WALK_X0 + p;
    const w = Math.sin(d * 4.2 + cfg.phase); // ก้าวเดินสัมพันธ์กับระยะทาง
    const sw = w * 0.6;
    if (legL.current) legL.current.rotation.x = sw;
    if (legR.current) legR.current.rotation.x = -sw;
    if (armL.current) armL.current.rotation.x = -sw * 0.8;
    if (armR.current) armR.current.rotation.x = sw * 0.8;
    g.current.position.y = 0.06 + Math.abs(Math.cos(d * 4.2 + cfg.phase)) * 0.03 * cfg.scale;
  });
  return (
    <group ref={g} position={[WALK_X0, 0.06, cfg.z]} rotation={[0, cfg.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0]} scale={cfg.scale}>
      {/* ขา */}
      {[
        [legL, -0.09],
        [legR, 0.09],
      ].map(([ref, px], i) => (
        <group key={i} ref={ref as RefObject<THREE.Group>} position={[px as number, 0.72, 0]}>
          <mesh position={[0, -0.34, 0]} castShadow>
            <boxGeometry args={[0.13, 0.7, 0.15]} />
            <meshStandardMaterial color={cfg.pants} roughness={0.9} />
          </mesh>
          <mesh position={[0, -0.69, 0.03]}>
            <boxGeometry args={[0.14, 0.07, 0.24]} />
            <meshStandardMaterial color="#111827" roughness={0.8} />
          </mesh>
        </group>
      ))}
      {/* ลำตัว */}
      <mesh position={[0, 1.02, 0]} castShadow>
        <boxGeometry args={[0.38, 0.6, 0.22]} />
        <meshStandardMaterial color={cfg.shirt} roughness={0.85} />
      </mesh>
      {/* แขน */}
      {[
        [armL, -0.25],
        [armR, 0.25],
      ].map(([ref, px], i) => (
        <group key={i} ref={ref as RefObject<THREE.Group>} position={[px as number, 1.28, 0]}>
          <mesh position={[0, -0.26, 0]}>
            <boxGeometry args={[0.1, 0.52, 0.12]} />
            <meshStandardMaterial color={cfg.shirt} roughness={0.85} />
          </mesh>
          <mesh position={[0, -0.55, 0]}>
            <sphereGeometry args={[0.055, 8, 8]} />
            <meshStandardMaterial color={cfg.skin} roughness={0.8} />
          </mesh>
        </group>
      ))}
      {/* หัว + ผม */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <sphereGeometry args={[0.14, 14, 14]} />
        <meshStandardMaterial color={cfg.skin} roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.55, -0.02]}>
        <sphereGeometry args={[0.15, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshStandardMaterial color={cfg.hair} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Pedestrians() {
  const walkers = useMemo(() => {
    const r = mulberry(5);
    const shirts = ['#ef4444', '#38bdf8', '#facc15', '#a78bfa', '#22c55e', '#f472b6', '#e2e8f0', '#fb923c'] as const;
    const pants = ['#1e293b', '#334155', '#1e3a5f', '#44403c', '#3f3f46'] as const;
    const skins = ['#f1c9a5', '#d9a77d', '#b9835a', '#8d5a3b'] as const;
    const hairs = ['#111827', '#3b2a20', '#6b4a2f', '#1f2937'] as const;
    // [z, จำนวนคน]
    const rows: [number, number][] = [
      [6.6, 2],
      [8.2, 3],
      [16.0, 2],
      [16.8, 3],
    ];
    const out: WalkerCfg[] = [];
    rows.forEach(([z, n]) => {
      for (let i = 0; i < n; i++) {
        out.push({
          z,
          dir: r() > 0.5 ? 1 : -1,
          speed: 0.7 + r() * 0.7,
          offset: r() * WALK_SPAN,
          shirt: pick(r, shirts),
          pants: pick(r, pants),
          skin: pick(r, skins),
          hair: pick(r, hairs),
          scale: 0.92 + r() * 0.16,
          phase: r() * 6,
        });
      }
    });
    return out;
  }, []);
  return (
    <group>
      {walkers.map((w, i) => (
        <Walker key={i} cfg={w} />
      ))}
    </group>
  );
}

// ============================================================
//  ต้นไม้ · ตึกไกล ๆ
// ============================================================
function Tree({ x, z, s }: { x: number; z: number; s: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.14, 0.2, 1.4, 8]} />
        <meshStandardMaterial color="#4a3426" roughness={1} />
      </mesh>
      {[
        [0, 1.9, 0, 0.95, '#2f9e6b'],
        [0.5, 1.55, 0.2, 0.62, '#3dbb83'],
        [-0.45, 1.65, -0.2, 0.66, '#2a8a5d'],
        [0.05, 2.5, 0, 0.6, '#3dbb83'],
      ].map(([px, py, pz, r, c], i) => (
        <mesh key={i} position={[px as number, py as number, pz as number]}>
          <icosahedronGeometry args={[r as number, 1]} />
          <meshStandardMaterial color={c as string} roughness={0.95} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Bush({ x, z }: { x: number; z: number }) {
  return (
    <mesh position={[x, 0.3, z]}>
      <icosahedronGeometry args={[0.45, 1]} />
      <meshStandardMaterial color="#2a8a5d" roughness={0.95} flatShading />
    </mesh>
  );
}

function windowTexture(cols: number, rows: number, rnd: () => number) {
  const S = 6;
  const c = document.createElement('canvas');
  c.width = cols * S;
  c.height = rows * S;
  const g = c.getContext('2d')!;
  const c2 = document.createElement("canvas");
  c2.width = c.width;
  c2.height = c.height;
  const g2 = c2.getContext("2d")!;
  g2.fillStyle = "#000";
  g2.fillRect(0, 0, c2.width, c2.height);
  g.fillStyle = "#ddd3ec";
  g.fillRect(0, 0, c.width, c.height);
  const lit = ['#fff1c4', '#ffffff', '#bfe3f5'];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (rnd() < 0.42) {
        g.fillStyle = pick(rnd, lit);
        g.fillRect(x * S + 1, y * S + 1, S - 2, S - 2);
        g2.fillStyle = g.fillStyle;
        g2.fillRect(x * S + 1, y * S + 1, S - 2, S - 2);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  const glow = new THREE.CanvasTexture(c2);
  glow.colorSpace = THREE.SRGBColorSpace;
  glow.magFilter = THREE.NearestFilter;
  t.userData.glow = glow;
  return t;
}

function Skyline() {
  const tod = useTod();
  const { items, textures } = useMemo(() => {
    const r = mulberry(21);
    const textures: THREE.Texture[] = [];
    const items: { x: number; z: number; w: number; d: number; h: number; tex: THREE.Texture }[] = [];
    // แถวหลังอาคาร (ไกล) + ฝั่งตรงข้ามถนนไกล ๆ ทางขวา
    let x = -64;
    while (x < 40) {
      const w = 4 + r() * 4;
      const h = 4 + r() * 9;
      const d = 5 + r() * 3;
      const tex = windowTexture(Math.round(w * 1.6), Math.round(h * 1.6), r);
      textures.push(tex);
      items.push({ x: x + w / 2, z: -30 - r() * 6, w, d, h, tex });
      x += w + 1 + r() * 2.5;
    }
    return { items, textures };
  }, []);
  useEffect(() => () => textures.forEach((t) => { t.userData.glow?.dispose(); t.dispose(); }), [textures]);
  return (
    <group>
      {items.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]}>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color="#ffffff" map={b.tex} emissive="#ffffff" emissiveMap={b.tex.userData.glow} emissiveIntensity={0.2 + 1.1 * SKY[tod].lamp} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Greenery() {
  const trees = useMemo(() => {
    const r = mulberry(33);
    const out: { x: number; z: number; s: number }[] = [];
    // สวนด้านหลังอาคาร
    for (let x = -34; x < 20; x += 3.8) out.push({ x: x + r() * 2, z: -9.2 - r() * 4, s: 0.85 + r() * 0.5 });
    // ข้าง ๆ อาคารซ้าย/ขวา
    for (let z = -6; z < 5; z += 4.2) {
      out.push({ x: LOUNGE.minX - 2.2 - r() * 2.5, z: z + r(), s: 0.9 + r() * 0.5 });
      out.push({ x: 21 + r() * 2.5, z: z + r() - 1.5, s: 0.9 + r() * 0.5 });
    }
    // ริมถนนฝั่งตรงข้าม
    for (let x = -40; x < 34; x += 6.5) out.push({ x: x + r() * 2, z: 16.7, s: 0.75 + r() * 0.3 });
    return out;
  }, []);
  const bushes = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    // พุ่มไม้เรียงหน้าอาคาร ชิดผนังหน้า
    for (let x = LOUNGE.minX + 1; x < ROOM.maxX - 0.5; x += 2.1) out.push({ x, z: WALK_Z0 + 0.55 });
    return out;
  }, []);
  return (
    <group>
      {trees.map((t, i) => (
        <Tree key={i} x={t.x} z={t.z} s={t.s} />
      ))}
      {bushes.map((b, i) => (
        <Bush key={i} x={b.x} z={b.z} />
      ))}
    </group>
  );
}

// ============================================================
function Outdoors() {
  const lamps = useMemo(() => Array.from({ length: 9 }, (_, i) => -40 + i * 9), []);
  return (
    <group>
      <Roads />
      {lamps.map((x) => (
        <Lamp key={x} x={x} />
      ))}
      <BusStop x={-17} />
      <Greenery />
      <Skyline />
      <Traffic />
      <Pedestrians />
    </group>
  );
}

export default memo(Outdoors);
