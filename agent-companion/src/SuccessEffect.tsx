import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface SuccessEffectProps {
  /** สีออร่า/คลื่นกระแทก */
  color?: string;
  /** สีประกายดาว */
  sparkleColor?: string;
}

const SPARK_COUNT = 70;
const RING_PERIOD = 1.6; // วินาทีต่อหนึ่งรอบคลื่น
const RINGS = 2; // จำนวนคลื่นที่ซ้อนเหลื่อมเวลากัน

/** สร้าง texture รูปดาว 4 แฉกเรืองแสง ด้วย canvas (ไม่ต้องมีไฟล์รูป) */
function createStarTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const c = size / 2;

  const glow = g.createRadialGradient(c, c, 0, c, c, c);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, size, size);

  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.moveTo(c, 2);
  g.quadraticCurveTo(c, c, size - 2, c);
  g.quadraticCurveTo(c, c, c, size - 2);
  g.quadraticCurveTo(c, c, 2, c);
  g.quadraticCurveTo(c, c, c, 2);
  g.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * เอฟเฟกต์ความสำเร็จ 3 ชั้น
 *  1) Shockwave ring – วงแหวนแสงแผ่จากพื้น (scale ↑, opacity ↓) วนซ้ำ
 *  2) Sparkles      – อนุภาคดาวสีทอง ปะทุครั้งแรกแรง ๆ แล้วพวยพุ่งต่อเนื่อง
 *  3) Glow globe    – ทรงกลมโปร่งแสงเต้นวูบวาบรอบตัว
 *
 * ทั้งหมดใช้ AdditiveBlending + depthWrite=false → แสงซ้อนกันแล้วสว่างขึ้น ไม่บังกันเอง
 * คอมโพเนนต์นี้ถูก mount เฉพาะตอน status = success → mount ใหม่ = ปะทุใหม่ทุกครั้ง
 */
export default function SuccessEffect({ color = '#4ade80', sparkleColor = '#ffd54a' }: SuccessEffectProps) {
  const ringRefs = useRef<(THREE.Mesh | null)[]>([]);
  const globeRef = useRef<THREE.Mesh>(null);
  const innerGlobeRef = useRef<THREE.Mesh>(null);
  const pointsRef = useRef<THREE.Points>(null);

  const starTexture = useMemo(createStarTexture, []);
  useEffect(() => () => starTexture.dispose(), [starTexture]);

  // ---------- particle state (เก็บใน typed array ไม่ผ่าน React) ----------
  const sim = useMemo(() => {
    const positions = new Float32Array(SPARK_COUNT * 3);
    const colors = new Float32Array(SPARK_COUNT * 3);
    const velocities = new Float32Array(SPARK_COUNT * 3);
    const life = new Float32Array(SPARK_COUNT);
    const maxLife = new Float32Array(SPARK_COUNT);
    return { positions, colors, velocities, life, maxLife };
  }, []);

  const baseColor = useMemo(() => new THREE.Color(sparkleColor), [sparkleColor]);

  const spawn = (i: number, burst: boolean) => {
    const { positions, velocities, life, maxLife } = sim;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.35;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = 0.9 + Math.random() * 0.6;
    positions[i * 3 + 2] = Math.sin(a) * r;

    const speed = burst ? 2.5 + Math.random() * 2.5 : 0.8 + Math.random() * 1.2;
    velocities[i * 3] = Math.cos(a) * speed * (burst ? 0.6 : 0.25);
    velocities[i * 3 + 1] = burst ? 2.5 + Math.random() * 3 : 1.6 + Math.random() * 1.8;
    velocities[i * 3 + 2] = Math.sin(a) * speed * (burst ? 0.6 : 0.25);

    maxLife[i] = 0.9 + Math.random() * 0.9;
    // ตอนปะทุครั้งแรกให้ทุกตัวเกิดพร้อมกัน, หลังจากนั้นสุ่มเหลื่อมเวลาเพื่อให้ไหลต่อเนื่อง
    life[i] = burst ? maxLife[i] : maxLife[i] * Math.random();
  };

  useEffect(() => {
    for (let i = 0; i < SPARK_COUNT; i++) spawn(i, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);

    // 1) Shockwave rings
    ringRefs.current.forEach((ring, k) => {
      if (!ring) return;
      const phase = ((t + (k * RING_PERIOD) / RINGS) % RING_PERIOD) / RING_PERIOD;
      const s = 0.3 + phase * 3.4;
      ring.scale.set(s, s, s);
      (ring.material as THREE.MeshBasicMaterial).opacity = (1 - phase) ** 1.5 * 0.85;
    });

    // 3) Glow globe – เต้นตามไซน์ผสมสุ่มเล็กน้อย = วูบวาบแบบพลังงาน
    if (globeRef.current) {
      const pulse = 1 + Math.sin(t * 5) * 0.06 + Math.sin(t * 13) * 0.02;
      globeRef.current.scale.setScalar(pulse);
      (globeRef.current.material as THREE.MeshBasicMaterial).opacity =
        0.1 + (Math.sin(t * 6) * 0.5 + 0.5) * 0.08 + Math.random() * 0.02;
    }
    if (innerGlobeRef.current) {
      innerGlobeRef.current.scale.setScalar(1 + Math.sin(t * 7 + 1) * 0.08);
    }

    // 2) Sparkles
    const { positions, colors, velocities, life, maxLife } = sim;
    for (let i = 0; i < SPARK_COUNT; i++) {
      life[i] -= dt;
      if (life[i] <= 0) spawn(i, false);
      const ix = i * 3;
      velocities[ix + 1] -= 1.2 * dt; // แรงโน้มถ่วงเบา ๆ ให้โค้งสวย
      positions[ix] += velocities[ix] * dt;
      positions[ix + 1] += velocities[ix + 1] * dt;
      positions[ix + 2] += velocities[ix + 2] * dt;

      // Additive blending: สีดำ = มองไม่เห็น → ใช้ความเข้มของสีแทน opacity รายอนุภาค
      const f = Math.max(0, life[i] / maxLife[i]);
      const twinkle = 0.6 + 0.4 * Math.sin(t * 25 + i * 7);
      const k = f * twinkle;
      colors[ix] = baseColor.r * k;
      colors[ix + 1] = baseColor.g * k;
      colors[ix + 2] = baseColor.b * k;
    }
    const geo = pointsRef.current?.geometry;
    if (geo) {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* 1) Shockwave rings */}
      {Array.from({ length: RINGS }).map((_, k) => (
        <mesh
          key={k}
          ref={(m) => {
            ringRefs.current[k] = m;
          }}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.03, 0]}
        >
          <ringGeometry args={[0.85, 1, 64]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* 3) Glow globe: ชั้นนอกบาง + ชั้นในด้านหลัง ให้ขอบดูฟุ้ง */}
      <mesh ref={globeRef} position={[0, 1.25, 0]}>
        <sphereGeometry args={[1.35, 32, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={innerGlobeRef} position={[0, 1.25, 0]}>
        <sphereGeometry args={[1.1, 32, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.08}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 2) Golden sparkles */}
      <points ref={pointsRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[sim.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[sim.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          map={starTexture}
          size={0.22}
          sizeAttenuation
          vertexColors
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
}
