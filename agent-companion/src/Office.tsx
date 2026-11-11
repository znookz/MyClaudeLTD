import { memo, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { STATUS_META, type AgentStatus } from './types';
import {
  DESKS,
  DOOR,
  LOUNGE,
  LOUNGE_DOOR,
  LOUNGE_ITEMS,
  MEETING_SPOTS,
  MEETING_TABLE_R,
  PLANTS,
  ROOM,
} from './utils/office';

const W = ROOM.maxX - ROOM.minX; // 17
const D = ROOM.maxZ - ROOM.minZ; // 12
const CX = (ROOM.maxX + ROOM.minX) / 2;
const CZ = (ROOM.maxZ + ROOM.minZ) / 2;
// ผนังหน้า/หลังยาวคลุมทั้งห้องทำงานและห้องพักผ่อน
const ALL_W = ROOM.maxX - LOUNGE.minX;
const ALL_CX = (ROOM.maxX + LOUNGE.minX) / 2;

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

// ============================================================
//  ห้องพักผ่อน (แยกจากห้องทำงาน): ตู้เกม · เกมคอนโซล · โต๊ะพูล · โซฟา · เก้าอี้นวด
//  เฟอร์นิเจอร์ที่นั่งได้วาดใน local frame ที่ "ด้านหน้า = +z" แล้วหมุนทั้งกลุ่มเอา
// ============================================================
const LW = LOUNGE.maxX - LOUNGE.minX; // 8
const LCX = (LOUNGE.maxX + LOUNGE.minX) / 2;

function LoungeFloor() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#3a2a4f';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#42305a';
    for (let i = 0; i < 4; i++) g.fillRect(i * 32, 0, 16, 128); // ลายพรมเป็นริ้ว
    g.strokeStyle = '#4d3968';
    g.lineWidth = 2;
    g.strokeRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(LW / 1.6, D / 1.6);
    t.anisotropy = 8;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[LCX, 0, CZ]} receiveShadow>
      <planeGeometry args={[LW, D]} />
      <meshStandardMaterial map={tex} roughness={0.95} metalness={0} />
    </mesh>
  );
}

/** ผนังกั้นระหว่างสองห้อง: ครึ่งล่างทึบ ครึ่งบนเป็นกระจก (มองทะลุเห็นอีกห้องได้) + ช่องประตู */
function Divider() {
  const x = ROOM.minX;
  const parts: [number, number][] = [
    [ROOM.minZ, LOUNGE_DOOR.z0],
    [LOUNGE_DOOR.z1, ROOM.maxZ],
  ];
  const doorMid = (LOUNGE_DOOR.z0 + LOUNGE_DOOR.z1) / 2;
  const doorW = LOUNGE_DOOR.z1 - LOUNGE_DOOR.z0;
  return (
    <group>
      {parts.map(([z0, z1]) => {
        const len = z1 - z0;
        const mid = (z0 + z1) / 2;
        return (
          <group key={z0} position={[x, 0, mid]}>
            <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.16, 1.1, len]} />
              <meshStandardMaterial color={COLORS.wall} roughness={0.92} />
            </mesh>
            <mesh position={[0, 1.95, 0]}>
              <boxGeometry args={[0.05, 1.7, len]} />
              <meshStandardMaterial color="#9fd8ff" transparent opacity={0.12} roughness={0.1} metalness={0.2} depthWrite={false} />
            </mesh>
            <mesh position={[0, 2.84, 0]}>
              <boxGeometry args={[0.12, 0.08, len]} />
              <meshStandardMaterial color={COLORS.baseboard} roughness={0.8} />
            </mesh>
          </group>
        );
      })}
      {/* วงกบประตู + ป้ายไฟ */}
      {[LOUNGE_DOOR.z0, LOUNGE_DOOR.z1].map((z) => (
        <mesh key={z} position={[x, 1.44, z]} castShadow>
          <boxGeometry args={[0.2, 2.88, 0.12]} />
          <meshStandardMaterial color={COLORS.baseboard} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[x, 2.6, doorMid]}>
        <boxGeometry args={[0.2, 0.5, doorW]} />
        <meshStandardMaterial color={COLORS.baseboard} roughness={0.8} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[x + s * 0.11, 2.6, doorMid]}>
          <boxGeometry args={[0.02, 0.2, doorW * 0.6]} />
          <meshStandardMaterial color="#f472b6" emissive="#f472b6" emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Sofa({ x, z, rotationY, color = COLORS.sofa }: { x: number; z: number; rotationY: number; color?: string }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.21, -0.05]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.42, 0.7]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.62, -0.47]} castShadow>
        <boxGeometry args={[2.2, 0.82, 0.22]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 1.2, 0.34, -0.12]} castShadow>
          <boxGeometry args={[0.22, 0.68, 0.9]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      ))}
      {/* หมอนอิง */}
      <mesh position={[0, 0.56, -0.3]} rotation={[-0.25, 0, 0]}>
        <boxGeometry args={[0.42, 0.34, 0.1]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.95} />
      </mesh>
    </group>
  );
}

function LowTable({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 0.06, 1.0]} />
        <meshStandardMaterial color={COLORS.wood} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.14, 0]}>
        <boxGeometry args={[0.7, 0.28, 0.9]} />
        <meshStandardMaterial color={COLORS.woodDark} />
      </mesh>
      <mesh position={[0.15, 0.38, 0.2]}>
        <cylinderGeometry args={[0.05, 0.045, 0.1, 14]} />
        <meshStandardMaterial color="#f1f5f9" />
      </mesh>
    </group>
  );
}

const BALLS: [number, number, string][] = [
  [-0.75, 0.05, '#f8fafc'],
  [0.35, 0, '#facc15'],
  [0.47, 0.07, '#dc2626'],
  [0.47, -0.07, '#2563eb'],
  [0.59, 0.14, '#111827'],
  [0.59, 0, '#16a34a'],
  [0.59, -0.14, '#f97316'],
  [-0.2, -0.3, '#7c3aed'],
  [0.9, 0.35, '#be123c'],
];

function PoolTable({ x, z }: { x: number; z: number }) {
  const W2 = 2.6;
  const D2 = 1.4;
  return (
    <group position={[x, 0, z]}>
      {/* พรมใต้โต๊ะ */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} receiveShadow>
        <planeGeometry args={[4.6, 3.6]} />
        <meshStandardMaterial color="#5b2a6e" roughness={1} />
      </mesh>
      {/* ตัวโต๊ะ + ผ้าสักหลาด + ขอบ */}
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[W2 + 0.2, 0.2, D2 + 0.2]} />
        <meshStandardMaterial color="#5a3a22" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.825, 0]} receiveShadow>
        <boxGeometry args={[W2, 0.02, D2]} />
        <meshStandardMaterial color="#15803d" roughness={0.95} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`x${s}`} position={[0, 0.86, s * (D2 / 2 + 0.05)]} castShadow>
          <boxGeometry args={[W2 + 0.2, 0.07, 0.1]} />
          <meshStandardMaterial color="#7a4f2d" roughness={0.5} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`z${s}`} position={[s * (W2 / 2 + 0.05), 0.86, 0]} castShadow>
          <boxGeometry args={[0.1, 0.07, D2 + 0.2]} />
          <meshStandardMaterial color="#7a4f2d" roughness={0.5} />
        </mesh>
      ))}
      {/* หลุม 6 หลุม */}
      {[-1, 0, 1].flatMap((ix) =>
        [-1, 1].map((iz) => (
          <mesh key={`${ix}${iz}`} rotation={[-Math.PI / 2, 0, 0]} position={[ix * (W2 / 2 - 0.04), 0.838, iz * (D2 / 2 - 0.04)]}>
            <circleGeometry args={[0.075, 16]} />
            <meshBasicMaterial color="#05080d" />
          </mesh>
        )),
      )}
      {/* ขาโต๊ะ */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 1.15, 0.31, sz * 0.55]} castShadow>
            <boxGeometry args={[0.16, 0.62, 0.16]} />
            <meshStandardMaterial color="#3d2716" roughness={0.7} />
          </mesh>
        )),
      )}
      {BALLS.map(([bx, bz, c], i) => (
        <mesh key={i} position={[bx, 0.88, bz]} castShadow>
          <sphereGeometry args={[0.045, 14, 14]} />
          <meshStandardMaterial color={c} roughness={0.2} metalness={0.1} />
        </mesh>
      ))}
      {/* โคมไฟเหนือโต๊ะ */}
      <mesh position={[0, 2.5, 0]}>
        <boxGeometry args={[1.8, 0.12, 0.5]} />
        <meshStandardMaterial color="#14532d" roughness={0.5} />
      </mesh>
      <mesh position={[0, 2.43, 0]}>
        <boxGeometry args={[1.6, 0.03, 0.36]} />
        <meshStandardMaterial color="#fef9c3" emissive="#fde68a" emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
      {[-0.7, 0.7].map((cx) => (
        <mesh key={cx} position={[cx, 3.05, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 1.0, 6]} />
          <meshStandardMaterial color="#1b2333" />
        </mesh>
      ))}
      <pointLight position={[0, 2.2, 0]} color="#fde68a" intensity={6} distance={6} />
    </group>
  );
}

function ArcadeCabinet({ x, z, color, seed }: { x: number; z: number; color: string; seed: number }) {
  const screen = useRef<THREE.MeshStandardMaterial>(null);
  const tint = useMemo(() => new THREE.Color(), []);
  useFrame((state) => {
    if (!screen.current) return;
    const t = state.clock.elapsedTime + seed * 3.7;
    // หน้าจอเปลี่ยนสีวนไปเรื่อย ๆ เหมือนเกมกำลังเล่น demo
    tint.setHSL((t * 0.13) % 1, 0.85, 0.55);
    screen.current.emissive.copy(tint);
    screen.current.emissiveIntensity = 1.3 + Math.sin(t * 9) * 0.25;
  });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.95, -0.05]} castShadow receiveShadow>
        <boxGeometry args={[0.86, 1.9, 0.7]} />
        <meshStandardMaterial color="#141a2b" roughness={0.6} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.44, 0.95, -0.02]}>
          <boxGeometry args={[0.03, 1.94, 0.78]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} toneMapped={false} />
        </mesh>
      ))}
      {/* ป้ายไฟด้านบน */}
      <mesh position={[0, 1.76, 0.31]}>
        <boxGeometry args={[0.78, 0.2, 0.03]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} toneMapped={false} />
      </mesh>
      {/* จอ */}
      <mesh position={[0, 1.34, 0.3]} rotation={[-0.2, 0, 0]}>
        <boxGeometry args={[0.7, 0.52, 0.03]} />
        <meshStandardMaterial ref={screen} color="#0b1220" emissive="#22d3ee" emissiveIntensity={1.3} toneMapped={false} />
      </mesh>
      {/* แผงควบคุม: จอยสติ๊ก + ปุ่ม */}
      <mesh position={[0, 0.98, 0.42]} rotation={[0.22, 0, 0]} castShadow>
        <boxGeometry args={[0.84, 0.07, 0.36]} />
        <meshStandardMaterial color="#1f2937" roughness={0.5} />
      </mesh>
      <mesh position={[-0.2, 1.06, 0.42]}>
        <cylinderGeometry args={[0.012, 0.012, 0.12, 6]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      <mesh position={[-0.2, 1.13, 0.42]}>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshStandardMaterial color="#ef4444" roughness={0.3} />
      </mesh>
      {['#facc15', '#22c55e', '#38bdf8'].map((c, i) => (
        <mesh key={c} position={[0.08 + i * 0.11, 1.02, 0.44]}>
          <cylinderGeometry args={[0.035, 0.035, 0.03, 12]} />
          <meshStandardMaterial color={c} emissive={c} emissiveIntensity={1.2} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function TvConsole({ x, z }: { x: number; z: number }) {
  const screen = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((state) => {
    if (!screen.current) return;
    const t = state.clock.elapsedTime;
    screen.current.emissiveIntensity = 1.1 + Math.sin(t * 5) * 0.15 + Math.sin(t * 13) * 0.1;
  });
  return (
    <group position={[x, 0, z]}>
      {/* ชั้นวาง + เครื่องเกม */}
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.5, 0.5]} />
        <meshStandardMaterial color={COLORS.woodDark} roughness={0.6} />
      </mesh>
      <mesh position={[-0.5, 0.56, 0.02]} castShadow>
        <boxGeometry args={[0.5, 0.1, 0.34]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.4} />
      </mesh>
      <mesh position={[-0.5, 0.56, 0.195]}>
        <boxGeometry args={[0.3, 0.015, 0.01]} />
        <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={2.5} toneMapped={false} />
      </mesh>
      {/* ทีวีจอใหญ่ */}
      <mesh position={[0, 1.55, -0.18]} castShadow>
        <boxGeometry args={[2.3, 1.3, 0.07]} />
        <meshStandardMaterial color="#0b0f17" roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[0, 1.55, -0.14]}>
        <planeGeometry args={[2.16, 1.16]} />
        <meshStandardMaterial ref={screen} color="#0b1220" emissive="#6366f1" emissiveIntensity={1.1} toneMapped={false} />
      </mesh>
      {/* ภาพในเกม: พื้น + ตัวละคร 2 ตัว */}
      <mesh position={[0, 1.12, -0.135]}>
        <planeGeometry args={[2.16, 0.3]} />
        <meshBasicMaterial color="#16a34a" toneMapped={false} />
      </mesh>
      {[
        [-0.5, '#f97316'],
        [0.45, '#f43f5e'],
      ].map(([px, c]) => (
        <mesh key={c as string} position={[px as number, 1.4, -0.13]}>
          <planeGeometry args={[0.2, 0.28]} />
          <meshBasicMaterial color={c as string} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function MassageChair({ x, z, rotationY }: { x: number; z: number; rotationY: number }) {
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((state) => {
    if (glow.current) glow.current.emissiveIntensity = 1.4 + Math.sin(state.clock.elapsedTime * 2.5 + z) * 0.8;
  });
  const leather = { color: '#3b2f2a', roughness: 0.55 } as const;
  return (
    <group position={[x, 0, z]} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.2, 0.02]} castShadow receiveShadow>
        <boxGeometry args={[0.98, 0.4, 0.86]} />
        <meshStandardMaterial {...leather} />
      </mesh>
      {/* พนักพิงเอนหลัง + หมอนรองหัว */}
      <group position={[0, 0.4, -0.42]} rotation={[-0.16, 0, 0]}>
        <mesh position={[0, 0.62, 0]} castShadow>
          <boxGeometry args={[0.9, 1.3, 0.24]} />
          <meshStandardMaterial {...leather} />
        </mesh>
        <mesh position={[0, 1.14, 0.1]}>
          <boxGeometry args={[0.5, 0.26, 0.12]} />
          <meshStandardMaterial color="#d6c2a8" roughness={0.8} />
        </mesh>
      </group>
      {/* ที่พักแขนแบบหุ้มข้าง */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.6, 0.38, 0.05]} castShadow>
          <boxGeometry args={[0.2, 0.62, 0.95]} />
          <meshStandardMaterial {...leather} />
        </mesh>
      ))}
      {/* แถบไฟข้างเก้าอี้ */}
      {[-1, 1].map((s) => (
        <mesh key={`l${s}`} position={[s * 0.705, 0.4, 0.05]}>
          <boxGeometry args={[0.012, 0.06, 0.8]} />
          <meshStandardMaterial
            ref={s > 0 ? glow : undefined}
            color="#2dd4bf"
            emissive="#2dd4bf"
            emissiveIntensity={1.6}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function Lounge() {
  const { pool, arcades, tv, tvSofa, wallSofa, lowTable, massage } = LOUNGE_ITEMS;
  return (
    <group>
      <LoungeFloor />
      <Divider />
      <PoolTable x={pool.x} z={pool.z} />
      {arcades.map((a, i) => (
        <ArcadeCabinet key={i} x={a.x} z={a.z} color={i % 2 ? '#22d3ee' : '#f472b6'} seed={i} />
      ))}
      <TvConsole x={tv.x} z={tv.z} />
      <Sofa x={tvSofa.x} z={tvSofa.z} rotationY={Math.PI} color="#7c3f6b" />
      <Sofa x={wallSofa.x} z={wallSofa.z} rotationY={Math.PI / 2} />
      <LowTable x={lowTable.x} z={lowTable.z} />
      {massage.map((m, i) => (
        <MassageChair key={i} x={m.x} z={m.z} rotationY={Math.PI / 2} />
      ))}
      <pointLight position={[-14.5, 2.4, -4.6]} color="#f472b6" intensity={5} distance={6} />
      <pointLight position={[-10.8, 2.0, -4.6]} color="#818cf8" intensity={4} distance={5} />
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

      {/* ผนังหลัง (ยาวตลอดทั้งสองห้อง): หน้าต่างฝั่งห้องทำงาน + ป้ายนีออนฝั่งห้องพักผ่อน */}
      <Wall position={[ALL_CX, 0, ROOM.minZ]} rotationY={0} length={ALL_W} outward={[0, -1]}>
        {[-6, -2, 2, 6].map((x) => (
          <Window key={x} x={x - ALL_CX} />
        ))}
        {/* ป้ายนีออนเหนือตู้เกม */}
        <group position={[-14.5 - ALL_CX, 2.75, 0.04]}>
          {[
            [-0.7, 0, 1.0, '#f472b6'],
            [0.55, 0.12, 0.9, '#22d3ee'],
            [0.2, -0.2, 1.5, '#facc15'],
          ].map(([px, py, w, c], i) => (
            <mesh key={i} position={[px as number, py as number, 0]}>
              <boxGeometry args={[w as number, 0.06, 0.03]} />
              <meshStandardMaterial color={c as string} emissive={c as string} emissiveIntensity={2.4} toneMapped={false} />
            </mesh>
          ))}
        </group>
      </Wall>

      {/* ผนังหน้า (ฝั่งกล้อง): จะซ่อนเมื่อกล้องอยู่ข้างนอก */}
      <Wall position={[ALL_CX, 0, ROOM.maxZ]} rotationY={Math.PI} length={ALL_W} outward={[0, 1]} />

      {/* ผนังซ้าย (ของห้องพักผ่อน): local x = -world z → กระดานปาเป้าที่ z = -4.4 */}
      <Wall position={[LOUNGE.minX, 0, 0]} rotationY={Math.PI / 2} length={D} outward={[-1, 0]}>
        <group position={[4.4, 1.9, 0.03]}>
          {[
            [0.42, '#111827'],
            [0.32, '#f8fafc'],
            [0.2, '#dc2626'],
            [0.08, '#16a34a'],
          ].map(([r, c], i) => (
            <mesh key={i} position={[0, 0, i * 0.004]}>
              <circleGeometry args={[r as number, 28]} />
              <meshStandardMaterial color={c as string} roughness={0.7} />
            </mesh>
          ))}
        </group>
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
      <PrinterStation />
      <Lounge />
      {PLANTS.map((p, i) => (
        <Plant key={i} x={p.x} z={p.z} />
      ))}
    </group>
  );
}

export default memo(Office);
