import { memo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CAFE, CAFE_CHAIR_DX } from './utils/office';

// ============================================================
//  ร้านกาแฟข้างอาคาร: ตัวร้าน + เคาน์เตอร์ + บาริสต้า + โต๊ะนั่ง + ลูกค้า
//  (Agent ที่ว่างอยู่เดินมานั่งกินได้ — จุดนั่งอยู่ใน POIS ของ utils/office.ts)
// ============================================================
const WOOD = '#8a6a47';
const DECK_Y = 0.02;

interface PersonLook {
  shirt: string;
  pants: string;
  skin: string;
  hair: string;
}

/** คนนั่ง/ยืนอยู่กับที่ (หันหน้า +z ในกรอบของตัวเอง) ถ้า sip จะยกแก้วขึ้นจิบเป็นพัก ๆ ถ้า work จะชงกาแฟ */
function Person({
  look,
  sit = false,
  mode,
  phase = 0,
  position,
  rotationY = 0,
}: {
  look: PersonLook;
  sit?: boolean;
  mode: 'sip' | 'work' | 'idle';
  phase?: number;
  position: [number, number, number];
  rotationY?: number;
}) {
  const armR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const cup = useRef<THREE.Group>(null);
  const hip = sit ? 0.45 : 0.72;

  useFrame((state) => {
    const t = state.clock.elapsedTime + phase;
    let sipK = 0;
    if (mode === 'sip') sipK = Math.pow(Math.max(0, Math.sin(t * 0.7)), 2);
    if (armR.current) {
      if (mode === 'work') armR.current.rotation.x = -1.1 + Math.sin(t * 3) * 0.25;
      else if (mode === 'sip') armR.current.rotation.x = -0.9 - sipK * 0.9;
      else armR.current.rotation.x = Math.sin(t * 1.2) * 0.1;
    }
    if (armL.current) {
      armL.current.rotation.x = mode === 'work' ? -0.9 + Math.sin(t * 2.2) * 0.15 : mode === 'sip' ? -0.7 : -Math.sin(t * 1.2) * 0.1;
    }
    if (head.current) head.current.rotation.x = -sipK * 0.25 + (mode === 'work' ? 0.15 : 0);
    if (cup.current) cup.current.visible = mode === 'sip';
  });

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* ขา */}
      {[-0.09, 0.09].map((px) =>
        sit ? (
          <group key={px} position={[px, hip, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <mesh position={[0, -0.2, 0]}>
              <boxGeometry args={[0.13, 0.4, 0.15]} />
              <meshStandardMaterial color={look.pants} roughness={0.9} />
            </mesh>
            <group position={[0, -0.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <mesh position={[0, -0.22, 0]}>
                <boxGeometry args={[0.12, 0.44, 0.14]} />
                <meshStandardMaterial color={look.pants} roughness={0.9} />
              </mesh>
              <mesh position={[0, -0.46, 0.04]}>
                <boxGeometry args={[0.14, 0.07, 0.24]} />
                <meshStandardMaterial color="#111827" roughness={0.8} />
              </mesh>
            </group>
          </group>
        ) : (
          <group key={px} position={[px, hip, 0]}>
            <mesh position={[0, -0.34, 0]}>
              <boxGeometry args={[0.13, 0.7, 0.15]} />
              <meshStandardMaterial color={look.pants} roughness={0.9} />
            </mesh>
            <mesh position={[0, -0.69, 0.03]}>
              <boxGeometry args={[0.14, 0.07, 0.24]} />
              <meshStandardMaterial color="#111827" roughness={0.8} />
            </mesh>
          </group>
        ),
      )}
      <group position={[0, hip - 0.72, 0]}>
        {/* ลำตัว */}
        <mesh position={[0, 1.02, 0]} castShadow>
          <boxGeometry args={[0.38, 0.6, 0.22]} />
          <meshStandardMaterial color={look.shirt} roughness={0.85} />
        </mesh>
        {/* แขน */}
        {[
          [armL, -0.25],
          [armR, 0.25],
        ].map(([ref, px], i) => (
          <group key={i} ref={ref as RefObject<THREE.Group>} position={[px as number, 1.28, 0]}>
            <mesh position={[0, -0.26, 0]}>
              <boxGeometry args={[0.1, 0.52, 0.12]} />
              <meshStandardMaterial color={look.shirt} roughness={0.85} />
            </mesh>
            <mesh position={[0, -0.55, 0]}>
              <sphereGeometry args={[0.055, 8, 8]} />
              <meshStandardMaterial color={look.skin} roughness={0.8} />
            </mesh>
            {i === 1 && (
              <group ref={cup} position={[0, -0.58, 0.04]}>
                <mesh>
                  <cylinderGeometry args={[0.06, 0.05, 0.11, 12]} />
                  <meshStandardMaterial color="#f8fafc" roughness={0.5} />
                </mesh>
              </group>
            )}
          </group>
        ))}
        {/* หัว + ผม */}
        <group ref={head} position={[0, 1.4, 0]}>
          <mesh position={[0, 0.1, 0]} castShadow>
            <sphereGeometry args={[0.14, 14, 14]} />
            <meshStandardMaterial color={look.skin} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.15, -0.02]}>
            <sphereGeometry args={[0.15, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial color={look.hair} roughness={0.9} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function Chair({ x, z, facing }: { x: number; z: number; facing: 1 | -1 }) {
  return (
    <group position={[x, 0, z]} rotation={[0, facing > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}>
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[0.46, 0.05, 0.46]} />
        <meshStandardMaterial color="#c2410c" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.68, -0.21]} castShadow>
        <boxGeometry args={[0.46, 0.5, 0.04]} />
        <meshStandardMaterial color="#c2410c" roughness={0.7} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 0.19, 0.19, sz * 0.19]}>
            <boxGeometry args={[0.04, 0.38, 0.04]} />
            <meshStandardMaterial color="#1b2333" />
          </mesh>
        )),
      )}
    </group>
  );
}

function Table({ x, z, cups = true }: { x: number; z: number; cups?: boolean }) {
  return (
    <group position={[x, DECK_Y, z]}>
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.05, 24]} />
        <meshStandardMaterial color="#e5dfd3" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.05, 0.1, 0.72, 10]} />
        <meshStandardMaterial color="#334155" metalness={0.5} roughness={0.4} />
      </mesh>
      {cups &&
        [-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.22, 0.79, 0.05]}>
            <cylinderGeometry args={[0.045, 0.04, 0.08, 12]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.5} />
          </mesh>
        ))}
    </group>
  );
}

function Steam({ phase }: { phase: number }) {
  const g = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!g.current) return;
    const k = (state.clock.elapsedTime * 0.4 + phase) % 1;
    g.current.position.y = 1.25 + k * 0.5;
    (g.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.35;
  });
  return (
    <mesh ref={g} position={[0, 1.25, 0]}>
      <sphereGeometry args={[0.05, 8, 8]} />
      <meshBasicMaterial color="#e2e8f0" transparent opacity={0.3} depthWrite={false} />
    </mesh>
  );
}

const BARISTA: PersonLook = { shirt: '#f5f5f4', pants: '#1f2937', skin: '#d9a77d', hair: '#111827' };
const GUESTS: PersonLook[] = [
  { shirt: '#38bdf8', pants: '#1e293b', skin: '#f1c9a5', hair: '#3b2a20' },
  { shirt: '#f472b6', pants: '#44403c', skin: '#b9835a', hair: '#111827' },
  { shirt: '#facc15', pants: '#1e3a5f', skin: '#8d5a3b', hair: '#111827' },
];

function Cafe() {
  const { deck, counter, tables, npcTables, queue, barista, npcQueue } = CAFE;
  const dw = deck.x1 - deck.x0;
  const dd = deck.z1 - deck.z0;
  const cx = (deck.x0 + deck.x1) / 2;
  const backZ = CAFE.shop.z0 + 0.7;
  const bulbs = Array.from({ length: 9 }, (_, i) => deck.x0 + 0.4 + (i * (dw - 0.8)) / 8);

  return (
    <group>
      {/* พื้นระเบียงไม้ */}
      <mesh position={[cx, 0, deck.z0 + dd / 2]} receiveShadow>
        <boxGeometry args={[dw, 0.04, dd]} />
        <meshStandardMaterial color={WOOD} roughness={0.75} />
      </mesh>

      {/* ผนังหลังร้าน + ผนังข้าง */}
      <mesh position={[cx, 1.5, backZ]} castShadow receiveShadow>
        <boxGeometry args={[dw, 3, 0.2]} />
        <meshStandardMaterial color="#ead2c4" roughness={0.85} />
      </mesh>
      {[deck.x0 + 0.1, deck.x1 - 0.1].map((x) => (
        <mesh key={x} position={[x, 1.5, (backZ + CAFE.shop.z1) / 2]} castShadow>
          <boxGeometry args={[0.2, 3, CAFE.shop.z1 - backZ]} />
          <meshStandardMaterial color="#ead2c4" roughness={0.85} />
        </mesh>
      ))}
      {/* ชั้นวางแก้วหลังบาริสต้า */}
      {[1.4, 1.9].map((y) => (
        <group key={y}>
          <mesh position={[cx, y, backZ + 0.2]}>
            <boxGeometry args={[4.4, 0.05, 0.3]} />
            <meshStandardMaterial color={WOOD} />
          </mesh>
          {Array.from({ length: 10 }, (_, i) => (
            <mesh key={i} position={[cx - 2 + i * 0.45, y + 0.08, backZ + 0.2]}>
              <cylinderGeometry args={[0.07, 0.06, 0.11, 10]} />
              <meshStandardMaterial color={i % 3 === 0 ? '#f59e0b' : '#f8fafc'} roughness={0.5} />
            </mesh>
          ))}
        </group>
      ))}
      {/* ป้ายเมนูกระดานดำ */}
      {[-1.8, 1.8].map((dx) => (
        <mesh key={dx} position={[cx + dx, 2.4, backZ + 0.11]}>
          <boxGeometry args={[1.3, 0.6, 0.04]} />
          <meshStandardMaterial color="#5b4a52" emissive="#f5b544" emissiveIntensity={0.15} />
        </mesh>
      ))}
      {/* ป้ายนีออนรูปแก้วกาแฟ */}
      <group position={[cx, 2.5, backZ + 0.12]}>
        <mesh>
          <cylinderGeometry args={[0.28, 0.2, 0.36, 16, 1, true]} />
          <meshStandardMaterial color="#fb923c" emissive="#fb923c" emissiveIntensity={2.4} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0.33, 0.02, 0]} rotation={[0, 0, 0]}>
          <torusGeometry args={[0.12, 0.025, 8, 16]} />
          <meshStandardMaterial color="#fb923c" emissive="#fb923c" emissiveIntensity={2.4} toneMapped={false} />
        </mesh>
      </group>

      {/* เคาน์เตอร์ */}
      <mesh position={[counter.x, 0.52, counter.z]} castShadow receiveShadow>
        <boxGeometry args={[counter.w, 1.04, counter.d]} />
        <meshStandardMaterial color="#5a3a22" roughness={0.6} />
      </mesh>
      <mesh position={[counter.x, 1.06, counter.z]}>
        <boxGeometry args={[counter.w + 0.1, 0.05, counter.d + 0.1]} />
        <meshStandardMaterial color="#e5dfd3" roughness={0.4} />
      </mesh>
      {/* เครื่องชงกาแฟ + ตู้โชว์ขนม + แก้ว */}
      <group position={[counter.x - 0.5, 1.09, counter.z - 0.05]}>
        <mesh position={[0, 0.25, 0]} castShadow>
          <boxGeometry args={[0.75, 0.5, 0.45]} />
          <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.3, 0.23]}>
          <boxGeometry args={[0.5, 0.06, 0.02]} />
          <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={2} toneMapped={false} />
        </mesh>
        <Steam phase={0} />
        <group position={[0, 0, 0.1]}>
          <Steam phase={0.5} />
        </group>
      </group>
      <mesh position={[counter.x + 1.4, 1.38, counter.z]}>
        <boxGeometry args={[1.1, 0.5, 0.5]} />
        <meshStandardMaterial color="#9fd8ff" transparent opacity={0.3} roughness={0.1} depthWrite={false} />
      </mesh>
      {['#e8956a', '#fda4af', '#facc15', '#a78bfa'].map((c, i) => (
        <mesh key={c} position={[counter.x + 1.05 + i * 0.23, 1.22, counter.z]}>
          <sphereGeometry args={[0.08, 10, 10]} />
          <meshStandardMaterial color={c} roughness={0.7} />
        </mesh>
      ))}
      {[0.6, 1.0].map((dx) => (
        <mesh key={dx} position={[counter.x + dx - 0.2, 1.14, counter.z + 0.15]}>
          <cylinderGeometry args={[0.045, 0.04, 0.08, 12]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      ))}
      {/* ป้ายหน้าเคาน์เตอร์ */}
      <mesh position={[counter.x, 0.55, counter.z + counter.d / 2 + 0.01]}>
        <boxGeometry args={[counter.w - 0.4, 0.5, 0.02]} />
        <meshStandardMaterial color="#2b1d12" emissive="#fb923c" emissiveIntensity={0.35} />
      </mesh>

      {/* คน: บาริสต้าหลังเคาน์เตอร์ + ลูกค้ายืนรอ */}
      <Person look={BARISTA} mode="work" position={[barista.x - 0.4, DECK_Y, barista.z]} />
      <Person look={GUESTS[2]} mode="sip" phase={1.3} position={[npcQueue.x, DECK_Y, npcQueue.z]} rotationY={Math.PI} />

      {/* โต๊ะ + เก้าอี้ (โต๊ะของ Agent ปล่อยว่างไว้ให้เดินมานั่ง) */}
      {tables.map((t, i) => (
        <group key={i}>
          <Table x={t.x} z={t.z} />
          <group position={[0, DECK_Y, 0]}>
            <Chair x={t.x - CAFE_CHAIR_DX} z={t.z} facing={1} />
            <Chair x={t.x + CAFE_CHAIR_DX} z={t.z} facing={-1} />
          </group>
        </group>
      ))}
      {npcTables.map((t, i) => (
        <group key={i}>
          <Table x={t.x} z={t.z} />
          <group position={[0, DECK_Y, 0]}>
            <Chair x={t.x - CAFE_CHAIR_DX} z={t.z} facing={1} />
            <Chair x={t.x + CAFE_CHAIR_DX} z={t.z} facing={-1} />
          </group>
          <Person look={GUESTS[0]} sit mode="sip" phase={0} position={[t.x - CAFE_CHAIR_DX, DECK_Y, t.z]} rotationY={Math.PI / 2} />
          <Person look={GUESTS[1]} sit mode="sip" phase={2.4} position={[t.x + CAFE_CHAIR_DX, DECK_Y, t.z]} rotationY={-Math.PI / 2} />
        </group>
      ))}
      {/* ป้ายจุดสั่ง (ไม่ใช้ในเส้นทาง) */}
      {queue.map((q) => (
        <mesh key={q.x} position={[q.x, 0.03, q.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.28, 0.33, 24]} />
          <meshBasicMaterial color="#fb923c" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      ))}

      {/* ไฟหลอดประดับ */}
      <mesh position={[cx, 3.05, backZ + 0.3]}>
        <boxGeometry args={[dw, 0.02, 0.02]} />
        <meshStandardMaterial color="#1b2333" />
      </mesh>
      {bulbs.map((x, i) => (
        <mesh key={x} position={[x, 2.95 - Math.sin((i / 8) * Math.PI) * 0.0, backZ + 0.3]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color="#ffe2a8" emissive="#ffd28a" emissiveIntensity={3} toneMapped={false} />
        </mesh>
      ))}
      <pointLight position={[cx, 2.6, -1.5]} color="#ffb86b" intensity={7} distance={9} />

      {/* กระถางต้นไม้ริมระเบียง */}
      {[deck.x0 + 0.3, deck.x1 - 0.3].map((x) => (
        <mesh key={x} position={[x, 0.3, deck.z1 - 0.3]} castShadow>
          <icosahedronGeometry args={[0.38, 1]} />
          <meshStandardMaterial color="#2a8a5d" roughness={0.95} flatShading />
        </mesh>
      ))}
    </group>
  );
}

export default memo(Cafe);
