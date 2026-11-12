import { memo, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useSceneSettings } from "./utils/sceneSettings";
import { findPath, randomFreeSpot, type Vec3 } from './utils/office';

// ============================================================
//  สัตว์เลี้ยงในออฟฟิศ: แมวส้ม + หมาครีม เดินเล่นตามห้อง (ใช้ A* เดียวกับ Agent) นั่ง/นอนสลับกัน
//  คลิกที่ตัวสัตว์ → หัวใจลอยขึ้น  + นกพิราบจิกพื้นบนทางเท้า
// ============================================================
interface Look {
  body: string;
  belly: string;
  ear: string;
  nose: string;
  scale: number;
  speed: number;
  floppy: boolean;
}
const CAT: Look = { body: '#f4b27c', belly: '#fff3e6', ear: '#f19a8e', nose: '#f48fb1', scale: 1, speed: 1.0, floppy: false };
const DOG: Look = { body: '#e8c9a0', belly: '#fffaf0', ear: '#b98b5e', nose: '#3b2f2a', scale: 1.75, speed: 1.35, floppy: true };

const heartGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-0.7, 0, -0.5, 0.6, 0, 0.25);
  s.bezierCurveTo(0.5, 0.6, 0.7, 0, 0, -0.5);
  return new THREE.ShapeGeometry(s);
})();

type Mode = 'walk' | 'sit' | 'sleep';

function Pet({ look, start, seed }: { look: Look; start: Vec3; seed: number }) {
  const clock = useThree((s) => s.clock);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const legs = useRef<(THREE.Group | null)[]>([]);
  const tail = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const hearts = useRef<(THREE.Mesh | null)[]>([]);
  const st = useRef({
    mode: 'sit' as Mode,
    until: seed * 2,
    path: [] as Vec3[],
    phase: 0,
    yaw: 0,
    curl: 0,
    heart: -1,
  });
  const [hover, setHover] = useState(false);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const s = st.current;
    const r = root.current;
    if (!r || !body.current) return;

    // ---- ตัดสินใจ ----
    if (t >= s.until && s.mode !== 'walk') {
      s.path = findPath([r.position.x, 0, r.position.z], randomFreeSpot());
      s.mode = 'walk';
    }
    if (s.mode === 'walk') {
      const wp = s.path[0];
      if (!wp) {
        s.mode = Math.random() < 0.35 ? 'sleep' : 'sit';
        s.until = t + (s.mode === 'sleep' ? 14 + Math.random() * 14 : 4 + Math.random() * 8);
      } else {
        const dx = wp[0] - r.position.x;
        const dz = wp[2] - r.position.z;
        const d = Math.hypot(dx, dz);
        const step = look.speed * dt;
        if (d <= step) {
          r.position.x = wp[0];
          r.position.z = wp[2];
          s.path.shift();
        } else {
          r.position.x += (dx / d) * step;
          r.position.z += (dz / d) * step;
          s.phase += step * (6 / look.scale);
          let diff = Math.atan2(dx, dz) - s.yaw;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          s.yaw += diff * Math.min(1, dt * 9);
        }
      }
    }
    r.rotation.y = s.yaw;

    // ---- ท่าทาง ----
    const walking = s.mode === 'walk' && s.path.length > 0;
    const sleeping = s.mode === 'sleep';
    s.curl += ((sleeping ? 1 : 0) - s.curl) * Math.min(1, dt * 3);
    const sitK = s.mode === 'sit' ? 1 : 0;
    body.current.position.y =
      -0.13 * s.curl - 0.04 * sitK + (walking ? Math.abs(Math.sin(s.phase)) * 0.02 : Math.sin(t * 1.8 + seed) * 0.004);
    body.current.scale.y = 1 - 0.18 * s.curl;
    body.current.rotation.x = sitK * -0.35;
    legs.current.forEach((l, i) => {
      if (!l) return;
      l.rotation.x = walking ? Math.sin(s.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.7 : 0;
      l.visible = s.curl < 0.8;
    });
    if (tail.current) {
      tail.current.rotation.y = Math.sin(t * (walking ? 5 : 3) + seed) * (look.floppy ? 0.6 : 0.25);
      tail.current.rotation.x = -0.9 + (look.floppy ? 0.4 : 0) + Math.sin(t * 1.5) * 0.1 - s.curl * 0.2;
    }
    if (head.current) {
      head.current.position.y = 0.36 - 0.1 * s.curl;
      head.current.rotation.x = sleeping ? 0.5 : sitK * 0.3 + Math.sin(t * 0.9 + seed) * 0.05;
      head.current.rotation.z = s.mode === 'sit' ? Math.sin(t * 0.6 + seed) * 0.15 : 0;
    }
    if (eyes.current) eyes.current.scale.y = sleeping ? 0.1 : Math.sin(t * 0.7 + seed * 5) > 0.97 ? 0.1 : 1;

    // ---- หัวใจลอย ----
    if (s.heart >= 0) {
      const k = (t - s.heart) / 1.4;
      hearts.current.forEach((h, i) => {
        if (!h) return;
        h.visible = k < 1;
        h.position.set((i - 1) * 0.18, 0.6 + k * 0.7 + i * 0.1, 0);
        h.scale.setScalar(0.16 * (1 - k * 0.4));
        (h.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k);
        h.quaternion.copy(state.camera.quaternion);
      });
      if (k >= 1) s.heart = -1;
    }
  });

  const glow = hover ? 0.35 : 0;
  const leg = (i: number, x: number, z: number) => (
    <group
      key={i}
      ref={(g) => {
        legs.current[i] = g;
      }}
      position={[x, 0.2, z]}
    >
      <mesh position={[0, -0.09, 0]} castShadow>
        <boxGeometry args={[0.06, 0.18, 0.06]} />
        <meshStandardMaterial color={look.body} roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.19, 0.01]}>
        <boxGeometry args={[0.065, 0.03, 0.08]} />
        <meshStandardMaterial color={look.belly} roughness={0.9} />
      </mesh>
    </group>
  );

  return (
    <group
      ref={root}
      position={start}
      scale={look.scale}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = '';
      }}
      onClick={(e) => {
        e.stopPropagation();
        st.current.heart = clock.elapsedTime;
      }}
    >
      <group ref={body}>
        <mesh position={[0, 0.27, 0]} castShadow>
          <boxGeometry args={[0.24, 0.22, 0.52]} />
          <meshStandardMaterial color={look.body} roughness={0.9} emissive="#ffb3c7" emissiveIntensity={glow} />
        </mesh>
        <mesh position={[0, 0.2, 0.02]}>
          <boxGeometry args={[0.2, 0.06, 0.4]} />
          <meshStandardMaterial color={look.belly} roughness={0.9} />
        </mesh>
        {leg(0, -0.08, 0.2)}
        {leg(1, 0.08, 0.2)}
        {leg(2, -0.08, -0.2)}
        {leg(3, 0.08, -0.2)}
        <group ref={tail} position={[0, 0.34, -0.27]}>
          <mesh position={[0, 0, -0.16]} castShadow>
            <boxGeometry args={[0.06, 0.06, look.floppy ? 0.26 : 0.34]} />
            <meshStandardMaterial color={look.body} roughness={0.9} />
          </mesh>
        </group>
        <group ref={head} position={[0, 0.36, 0.3]}>
          <mesh castShadow>
            <sphereGeometry args={[0.13, 16, 16]} />
            <meshStandardMaterial color={look.body} roughness={0.9} emissive="#ffb3c7" emissiveIntensity={glow} />
          </mesh>
          <mesh position={[0, -0.03, 0.1]} scale={[1, 0.8, 1]}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshStandardMaterial color={look.belly} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0, 0.17]}>
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshStandardMaterial color={look.nose} />
          </mesh>
          {[-1, 1].map((sx) =>
            look.floppy ? (
              <mesh key={sx} position={[sx * 0.12, 0.0, -0.02]} rotation={[0, 0, sx * 0.25]} castShadow>
                <boxGeometry args={[0.05, 0.16, 0.1]} />
                <meshStandardMaterial color={look.ear} roughness={0.9} />
              </mesh>
            ) : (
              <mesh key={sx} position={[sx * 0.075, 0.12, -0.01]} rotation={[0, 0, -sx * 0.25]} castShadow>
                <coneGeometry args={[0.05, 0.11, 4]} />
                <meshStandardMaterial color={look.body} roughness={0.9} />
              </mesh>
            ),
          )}
          <group ref={eyes} position={[0, 0.03, 0.115]}>
            {[-1, 1].map((sx) => (
              <mesh key={sx} position={[sx * 0.05, 0, 0]}>
                <sphereGeometry args={[0.02, 8, 8]} />
                <meshStandardMaterial color="#2b2430" />
              </mesh>
            ))}
          </group>
        </group>
      </group>
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          ref={(m) => {
            hearts.current[i] = m;
          }}
          geometry={heartGeo}
          visible={false}
        >
          <meshBasicMaterial color="#f472b6" transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** นกพิราบ: เดินกรุบกริบจิกพื้นอยู่กับที่ */
function Pigeon({ x, z, seed }: { x: number; z: number; seed: number }) {
  const head = useRef<THREE.Group>(null);
  const g = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime + seed * 3;
    if (head.current) head.current.rotation.x = Math.pow(Math.max(0, Math.sin(t * 2.4)), 3) * 0.9;
    if (g.current) {
      g.current.position.x = x + Math.sin(t * 0.25) * 0.5;
      g.current.rotation.y = Math.cos(t * 0.25) > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  });
  return (
    <group ref={g} position={[x, 0.07, z]} scale={0.9}>
      <mesh position={[0, 0.14, 0]} castShadow>
        <sphereGeometry args={[0.1, 10, 10]} />
        <meshStandardMaterial color="#b8b3c9" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.13, -0.1]} rotation={[0.5, 0, 0]}>
        <coneGeometry args={[0.06, 0.16, 6]} />
        <meshStandardMaterial color="#9c97b3" roughness={0.9} />
      </mesh>
      <group ref={head} position={[0, 0.2, 0.08]}>
        <mesh position={[0, 0.03, 0.03]}>
          <sphereGeometry args={[0.055, 10, 10]} />
          <meshStandardMaterial color="#8f89aa" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.03, 0.09]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.014, 0.04, 6]} />
          <meshStandardMaterial color="#f5b544" />
        </mesh>
      </group>
      {[-0.03, 0.03].map((px) => (
        <mesh key={px} position={[px, 0.035, 0]}>
          <cylinderGeometry args={[0.006, 0.006, 0.07, 5]} />
          <meshStandardMaterial color="#f48fb1" />
        </mesh>
      ))}
    </group>
  );
}

function Pets() {
  const { low } = useSceneSettings();
  const spots = useMemo(() => ({ cat: randomFreeSpot(), dog: randomFreeSpot() }), []);
  return (
    <group>
      <Pet look={CAT} start={spots.cat} seed={1} />
      <Pet look={DOG} start={spots.dog} seed={2} />
      {!low && <Pigeon x={-9} z={7.4} seed={1} />}
      {!low && <Pigeon x={-8} z={7.8} seed={2} />}
      {!low && <Pigeon x={3} z={8.6} seed={3} />}
      {!low && <Pigeon x={12} z={8.2} seed={4} />}
    </group>
  );
}

export default memo(Pets);
