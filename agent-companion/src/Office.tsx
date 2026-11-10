import { memo, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { STATUS_META, type AgentStatus } from './types';
import { DESKS, DOOR, MEETING_SPOTS, MEETING_TABLE_R, PLANTS, ROOM } from './utils/office';

const W = ROOM.maxX - ROOM.minX; // 17
const D = ROOM.maxZ - ROOM.minZ; // 12
const CX = (ROOM.maxX + ROOM.minX) / 2;
const CZ = (ROOM.maxZ + ROOM.minZ) / 2;

const COLORS = {
  wall: '#26324b',
  baseboard: '#18202f',
  wood: '#c6a57a',
  woodDark: '#8a6a47',
  panel: '#2b3956',
  chair: '#34476b',
  sofa: '#46629a',
};

// ============================================================
//  พื้น: ลายกระเบื้อง (วาดด้วย canvas ไม่ต้องมีไฟล์รูป)
// ============================================================
function Floor() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#243049';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#27344f';
    g.fillRect(0, 0, 64, 64);
    g.fillRect(64, 64, 64, 64);
    g.strokeStyle = '#33425f';
    g.lineWidth = 2;
    g.strokeRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(W / 1.6, D / 1.6);
    t.anisotropy = 8;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CX, 0, CZ]} receiveShadow>
      <planeGeometry args={[W, D]} />
      <meshStandardMaterial map={tex} roughness={0.85} metalness={0.05} />
    </mesh>
  );
}

// ============================================================
//  ผนัง: ผนังที่อยู่ระหว่างกล้องกับห้องจะซ่อนเอง (หมุนกล้องไปรอบ ๆ ได้โดยไม่บัง)
//  local +z ของกลุ่ม = ทิศเข้าห้อง
// ============================================================
function Wall({
  position,
  rotationY,
  length,
  outward,
  children,
}: {
  position: [number, number, number];
  rotationY: number;
  length: number;
  outward: [number, number];
  children?: ReactNode;
}) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    if (!g.current) return;
    const dx = camera.position.x - position[0];
    const dz = camera.position.z - position[2];
    g.current.visible = dx * outward[0] + dz * outward[1] <= 0;
  });
  return (
    <group ref={g} position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, ROOM.wallH / 2, -0.1]} castShadow receiveShadow>
        <boxGeometry args={[length + 0.4, ROOM.wallH, 0.2]} />
        <meshStandardMaterial color={COLORS.wall} roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.09, 0.03]}>
        <boxGeometry args={[length, 0.18, 0.06]} />
        <meshStandardMaterial color={COLORS.baseboard} roughness={0.8} />
      </mesh>
      {/* แถบไฟ LED ใต้ขอบบน */}
      <mesh position={[0, ROOM.wallH - 0.08, 0.02]}>
        <boxGeometry args={[length, 0.03, 0.03]} />
        <meshStandardMaterial color="#67e8f9" emissive="#67e8f9" emissiveIntensity={1.4} toneMapped={false} />
      </mesh>
      {children}
    </group>
  );
}

function Window({ x }: { x: number }) {
  return (
    <group position={[x, 2.0, 0.01]}>
      <mesh>
        <boxGeometry args={[2.3, 1.45, 0.05]} />
        <meshStandardMaterial color="#0e2a4d" emissive="#1e4f87" emissiveIntensity={0.9} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <boxGeometry args={[0.05, 1.45, 0.03]} />
        <meshStandardMaterial color={COLORS.baseboard} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <boxGeometry args={[2.3, 0.05, 0.03]} />
        <meshStandardMaterial color={COLORS.baseboard} />
      </mesh>
      {/* ดวงจันทร์เล็ก ๆ ในกรอบ */}
      <mesh position={[0.6, 0.35, 0.03]}>
        <circleGeometry args={[0.12, 20]} />
        <meshBasicMaterial color="#dbeafe" toneMapped={false} />
      </mesh>
    </group>
  );
}

// ============================================================
//  โต๊ะทำงาน + เก้าอี้ (Agent นั่งหลังโต๊ะ หันหน้าเข้าหากล้อง)
// ============================================================
function Desk({ x, z, status }: { x: number; z: number; status: AgentStatus | null }) {
  const active = status !== null && status !== 'idle' && status !== 'success';
  const color = status ? STATUS_META[status].color : '#334155';
  const screenMat = useRef<THREE.MeshStandardMaterial>(null);
  const ledMat = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (screenMat.current) {
      const flicker = status === 'error' ? (Math.sin(t * 22) > 0 ? 1.6 : 0.2) : 0.9 + Math.sin(t * 3 + x) * 0.2;
      screenMat.current.emissiveIntensity = active ? flicker : 0.15;
    }
    if (ledMat.current) ledMat.current.emissiveIntensity = status ? 2.2 + Math.sin(t * 3 + z) * 0.7 : 0.2;
  });

  return (
    <group position={[x, 0, z]}>
      {/* โต๊ะ */}
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.05, 0.72]} />
        <meshStandardMaterial color={COLORS.wood} roughness={0.55} />
      </mesh>
      {[-0.7, 0.7].map((sx) => (
        <mesh key={sx} position={[sx, 0.36, 0]} castShadow>
          <boxGeometry args={[0.05, 0.7, 0.62]} />
          <meshStandardMaterial color={COLORS.woodDark} roughness={0.7} />
        </mesh>
      ))}
      {/* แผ่นหน้าโต๊ะ + แถบสถานะ */}
      <mesh position={[0, 0.46, 0.3]}>
        <boxGeometry args={[1.38, 0.4, 0.03]} />
        <meshStandardMaterial color={COLORS.panel} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.68, 0.33]}>
        <boxGeometry args={[1.38, 0.03, 0.02]} />
        <meshStandardMaterial ref={ledMat} color={color} emissive={color} emissiveIntensity={0.2} toneMapped={false} />
      </mesh>

      {/* จอ: หน้าจอหันเข้าหา Agent (-z) กล้องเห็นด้านหลังจอ + ไฟสถานะ */}
      <group position={[0, 0.745, 0.08]}>
        <mesh>
          <boxGeometry args={[0.22, 0.02, 0.14]} />
          <meshStandardMaterial color="#1b2333" />
        </mesh>
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[0.04, 0.14, 0.04]} />
          <meshStandardMaterial color="#1b2333" />
        </mesh>
        <mesh position={[0, 0.34, 0]} castShadow>
          <boxGeometry args={[0.7, 0.42, 0.035]} />
          <meshStandardMaterial color="#10161f" roughness={0.4} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.34, -0.019]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.64, 0.36]} />
          <meshStandardMaterial ref={screenMat} color="#0b1220" emissive={color} emissiveIntensity={0.15} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.17, 0.022]}>
          <sphereGeometry args={[0.022, 12, 12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} toneMapped={false} />
        </mesh>
      </group>
      {/* คีย์บอร์ด + เมาส์ + แก้วกาแฟ */}
      <mesh position={[0, 0.755, -0.2]}>
        <boxGeometry args={[0.46, 0.02, 0.15]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[0.4, 0.755, -0.2]}>
        <boxGeometry args={[0.07, 0.02, 0.11]} />
        <meshStandardMaterial color="#111827" />
      </mesh>
      <mesh position={[-0.6, 0.78, 0.12]}>
        <cylinderGeometry args={[0.05, 0.045, 0.09, 14]} />
        <meshStandardMaterial color="#f1f5f9" />
      </mesh>

      {/* เก้าอี้ (เก้าอี้อยู่หลังโต๊ะ ที่ z = -0.75) */}
      <group position={[0, 0, -0.75]}>
        <mesh position={[0, 0.37, 0]} castShadow>
          <boxGeometry args={[0.52, 0.06, 0.5]} />
          <meshStandardMaterial color={COLORS.chair} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.7, -0.25]} castShadow>
          <boxGeometry args={[0.5, 0.56, 0.06]} />
          <meshStandardMaterial color={COLORS.chair} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.34, 8]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.27, 0.27, 0.03, 5]} />
          <meshStandardMaterial color="#1b2333" />
        </mesh>
      </group>
    </group>
  );
}

// ============================================================
//  โต๊ะประชุม: เรืองแสงเมื่อมีกลุ่มกำลังร่วมงาน
// ============================================================
function MeetingTable({ x, z, active }: { x: number; z: number; active: boolean }) {
  const ring = useRef<THREE.MeshBasicMaterial>(null);
  const holo = useRef<THREE.MeshBasicMaterial>(null);
  const rug = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ring.current) {
      const target = active ? 0.55 + Math.sin(t * 3) * 0.15 : 0.1;
      ring.current.opacity += (target - ring.current.opacity) * 0.05;
    }
    if (holo.current) holo.current.opacity += ((active ? 0.35 + Math.sin(t * 5) * 0.1 : 0) - holo.current.opacity) * 0.08;
    if (rug.current) rug.current.emissiveIntensity += ((active ? 0.5 : 0.08) - rug.current.emissiveIntensity) * 0.05;
  });
  return (
    <group position={[x, 0, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} receiveShadow>
        <circleGeometry args={[2.1, 48]} />
        <meshStandardMaterial ref={rug} color="#15333f" emissive="#22d3ee" emissiveIntensity={0.08} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[2.0, 2.1, 96]} />
        <meshBasicMaterial ref={ring} color="#67e8f9" transparent opacity={0.1} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[MEETING_TABLE_R, MEETING_TABLE_R, 0.06, 40]} />
        <meshStandardMaterial color="#e5dfd3" roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.1, 0.16, 0.7, 16]} />
        <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* โฮโลแกรมกลางโต๊ะ */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.74, 0]}>
        <circleGeometry args={[0.5, 32]} />
        <meshBasicMaterial
          ref={holo}
          color="#67e8f9"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ============================================================
//  ของตกแต่ง
// ============================================================
function Plant({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.2, 0.5, 14]} />
        <meshStandardMaterial color="#d6d3d1" roughness={0.8} />
      </mesh>
      {[
        [0, 0.85, 0, 0.34],
        [0.18, 1.15, 0.05, 0.26],
        [-0.16, 1.05, -0.08, 0.24],
        [0.02, 1.4, -0.02, 0.2],
      ].map(([px, py, pz, r], i) => (
        <mesh key={i} position={[px, py, pz]} castShadow>
          <icosahedronGeometry args={[r, 1]} />
          <meshStandardMaterial color={i % 2 ? '#2f9e6b' : '#3dbb83'} roughness={0.9} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Bookshelf() {
  const books = useMemo(() => {
    const palette = ['#e8956a', '#67e8f9', '#a78bfa', '#f5b544', '#3dd6a3', '#fda4af', '#93c5fd'];
    const out: { z: number; y: number; h: number; w: number; c: string }[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let shelf = 0; shelf < 4; shelf++) {
      let z = -0.7;
      while (z < 0.7) {
        const w = 0.05 + rnd() * 0.05;
        out.push({ z: z + w / 2, y: 0.42 + shelf * 0.5, h: 0.28 + rnd() * 0.12, w, c: palette[Math.floor(rnd() * palette.length)] });
        z += w + 0.008;
      }
    }
    return out;
  }, []);
  return (
    <group position={[-8.25, 0, -1.4]}>
      <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 2.2, 1.6]} />
        <meshStandardMaterial color="#3d2f24" roughness={0.8} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0.07, 0.4 + i * 0.5, 0]}>
          <boxGeometry args={[0.4, 0.34, 1.46]} />
          <meshStandardMaterial color="#1c1611" roughness={1} />
        </mesh>
      ))}
      {books.map((b, i) => (
        <mesh key={i} position={[0.12, b.y, b.z]}>
          <boxGeometry args={[0.24, b.h, b.w]} />
          <meshStandardMaterial color={b.c} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function CoffeeCorner() {
  return (
    <group position={[-8.2, 0, 0.95]}>
      <mesh position={[0, 0.46, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.92, 2.1]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
      </mesh>
      <mesh position={[0.02, 0.93, 0]}>
        <boxGeometry args={[0.64, 0.04, 2.14]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      {/* เครื่องชงกาแฟ */}
      <mesh position={[-0.05, 1.18, -0.55]} castShadow>
        <boxGeometry args={[0.36, 0.46, 0.36]} />
        <meshStandardMaterial color="#1f2937" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0.14, 1.25, -0.55]}>
        <boxGeometry args={[0.02, 0.05, 0.1]} />
        <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={2} toneMapped={false} />
      </mesh>
      {/* ตู้ขนม */}
      <mesh position={[-0.05, 1.28, 0.5]} castShadow>
        <boxGeometry args={[0.34, 0.6, 0.6]} />
        <meshStandardMaterial color="#e8956a" roughness={0.5} />
      </mesh>
      {/* ตู้น้ำ */}
      <group position={[0.2, 0, 1.5]}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <cylinderGeometry args={[0.27, 0.27, 0.9, 16]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.15, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 0.5, 16]} />
          <meshStandardMaterial color="#7dd3fc" transparent opacity={0.55} roughness={0.1} />
        </mesh>
      </group>
    </group>
  );
}

function Sofa() {
  return (
    <group position={[-8.05, 0, 4.0]}>
      <mesh position={[0.05, 0.22, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.44, 2.15]} />
        <meshStandardMaterial color={COLORS.sofa} roughness={0.9} />
      </mesh>
      <mesh position={[-0.33, 0.7, 0]} castShadow>
        <boxGeometry args={[0.25, 0.7, 2.15]} />
        <meshStandardMaterial color={COLORS.sofa} roughness={0.9} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0.05, 0.4, s * 1.05]} castShadow>
          <boxGeometry args={[0.9, 0.5, 0.2]} />
          <meshStandardMaterial color="#3a527f" roughness={0.9} />
        </mesh>
      ))}
      {/* โต๊ะเตี้ยหน้าโซฟา */}
      <mesh position={[1.85, 0.22, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.06, 1.0]} />
        <meshStandardMaterial color={COLORS.wood} roughness={0.5} />
      </mesh>
      <mesh position={[1.85, 0.11, 0]}>
        <boxGeometry args={[0.7, 0.2, 0.9]} />
        <meshStandardMaterial color={COLORS.woodDark} />
      </mesh>
    </group>
  );
}

function PrinterStation() {
  return (
    <group position={[8.2, 0, 0.9]}>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.9, 1.4]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.05, 0]} castShadow>
        <boxGeometry args={[0.5, 0.3, 0.8]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
      </mesh>
      <mesh position={[-0.26, 1.1, 0.2]}>
        <boxGeometry args={[0.02, 0.04, 0.1]} />
        <meshStandardMaterial color="#3dd6a3" emissive="#3dd6a3" emissiveIntensity={2} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ============================================================
//  รวมทั้งห้อง
// ============================================================
interface OfficeProps {
  /** สถานะของ Agent ที่ใช้โต๊ะแต่ละตัว (null = โต๊ะว่าง) */
  deskStatus: (AgentStatus | null)[];
  /** โต๊ะประชุมตัวไหนมีกลุ่มกำลังใช้งาน */
  activeSpots: Set<number>;
}

function Office({ deskStatus, activeSpots }: OfficeProps) {
  return (
    <group>
      <Floor />

      {/* ผนังหลัง: หน้าต่าง */}
      <Wall position={[0, 0, ROOM.minZ]} rotationY={0} length={W} outward={[0, -1]}>
        {[-6, -2, 2, 6].map((x) => (
          <Window key={x} x={x} />
        ))}
      </Wall>

      {/* ผนังหน้า (ฝั่งกล้อง): จะซ่อนเมื่อกล้องอยู่ข้างนอก */}
      <Wall position={[0, 0, ROOM.maxZ]} rotationY={Math.PI} length={W} outward={[0, 1]} />

      {/* ผนังซ้าย: local x = -world z */}
      <Wall position={[ROOM.minX, 0, 0]} rotationY={Math.PI / 2} length={D} outward={[-1, 0]}>
        <mesh position={[3.2, 2.5, 0.03]}>
          <boxGeometry args={[2.4, 0.5, 0.04]} />
          <meshStandardMaterial color="#10161f" emissive="#e8956a" emissiveIntensity={0.35} toneMapped={false} />
        </mesh>
      </Wall>

      {/* ผนังขวา: local x = +world z → ไวต์บอร์ด z=-1.5, ประตู z=DOOR.z */}
      <Wall position={[ROOM.maxX, 0, 0]} rotationY={-Math.PI / 2} length={D} outward={[1, 0]}>
        <group position={[-1.5, 1.75, 0.05]}>
          <mesh>
            <boxGeometry args={[2.6, 1.4, 0.05]} />
            <meshStandardMaterial color="#e8edf5" roughness={0.3} emissive="#e8edf5" emissiveIntensity={0.12} />
          </mesh>
          {[
            [-0.6, 0.35, 1.0, '#ef4444'],
            [-0.5, 0.1, 1.3, '#2563eb'],
            [-0.7, -0.15, 0.7, '#16a34a'],
            [0.55, 0.3, 0.6, '#2563eb'],
            [0.5, 0.0, 0.8, '#ef4444'],
          ].map(([px, py, w, c], i) => (
            <mesh key={i} position={[px as number, py as number, 0.03]}>
              <boxGeometry args={[w as number, 0.035, 0.01]} />
              <meshBasicMaterial color={c as string} />
            </mesh>
          ))}
        </group>
        <group position={[DOOR.z, 1.1, 0.04]}>
          <mesh>
            <boxGeometry args={[1.35, 2.2, 0.06]} />
            <meshStandardMaterial color="#0f1624" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0, 0.035]}>
            <boxGeometry args={[1.1, 2.0, 0.02]} />
            <meshStandardMaterial color="#334463" roughness={0.6} />
          </mesh>
          <mesh position={[0.4, -0.05, 0.06]}>
            <sphereGeometry args={[0.04, 10, 10]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0, 1.3, 0.04]}>
            <boxGeometry args={[0.55, 0.15, 0.04]} />
            <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={1.6} toneMapped={false} />
          </mesh>
        </group>
      </Wall>

      {DESKS.map((d, i) => (
        <Desk key={i} x={d.x} z={d.z} status={deskStatus[i] ?? null} />
      ))}
      {MEETING_SPOTS.map((s, i) => (
        <MeetingTable key={i} x={s[0]} z={s[2]} active={activeSpots.has(i)} />
      ))}

      <Bookshelf />
      <CoffeeCorner />
      <Sofa />
      <PrinterStation />
      {PLANTS.map((p, i) => (
        <Plant key={i} x={p.x} z={p.z} />
      ))}
    </group>
  );
}

export default memo(Office);
