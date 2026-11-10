import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { FileCode2, User } from 'lucide-react';
import SuccessEffect from './SuccessEffect';
import { STATUS_META, type AgentState } from './types';
import type { Placement } from './utils/layout';
import { registerAnchors, unregisterAnchors } from './utils/registry';
import { getSpeakerLevel, releaseSpeaker } from './utils/sound';

interface Agent3DProps {
  agent: AgentState;
  placement: Placement;
  selected: boolean;
  onSelect: (sessionId: string) => void;
}

const { damp, lerp } = THREE.MathUtils;
const BODY_Y = 1.15;
const TWO_PI = Math.PI * 2;

/** สีประจำตัวคนสั่งงาน — hash ชื่อ → hue (คนเดียวกันได้สีเดียวกันทุกครั้ง) */
function authorColor(author: string): string {
  let h = 0;
  for (let i = 0; i < author.length; i++) h = (h * 31 + author.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 70%, 60%)`;
}

const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

function Agent3D({ agent, placement, selected, onSelect }: Agent3DProps) {
  const { sessionId, status } = agent;
  const statusColor = STATUS_META[status].color;
  const accent = useMemo(() => authorColor(agent.author), [agent.author]);

  // ---------- refs ของชิ้นส่วนที่ต้องขยับทุกเฟรม ----------
  const root = useRef<THREE.Group>(null);
  const spawn = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const leftShoulder = useRef<THREE.Group>(null);
  const rightShoulder = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const eyeL = useRef<THREE.Mesh>(null);
  const eyeR = useRef<THREE.Mesh>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const mouthMat = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.Mesh>(null);
  const scanRing = useRef<THREE.Mesh>(null);
  const keyboard = useRef<THREE.Group>(null);
  const statusLightMat = useRef<THREE.MeshStandardMaterial>(null);
  const glowLight = useRef<THREE.PointLight>(null);

  // ---------- state ภายในที่ไม่ต้อง re-render ----------
  const anim = useRef({
    spawnT: 0,
    spin: 0,
    nextBlink: 1 + Math.random() * 3,
    blinkStart: -10,
  });
  const eyeMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#e0f2fe',
        emissive: '#7dd3fc',
        emissiveIntensity: 1.6,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => eyeMaterial.dispose(), [eyeMaterial]);
  const target = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // ตำแหน่งเกิด: ใต้จุดหมายเล็กน้อย → จะ "ลอยขึ้นมา" ด้วย lerp
  const spawnPosition = useMemo<[number, number, number]>(
    () => [placement.position[0], -1.5, placement.position[2]],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ลงทะเบียนจุดไหล่ให้ CollabBeam หาเจอ
  useEffect(() => {
    if (!leftShoulder.current || !rightShoulder.current) return;
    const value = { left: leftShoulder.current, right: rightShoulder.current };
    registerAnchors(sessionId, value);
    return () => unregisterAnchors(sessionId, value);
  }, [sessionId]);

  useEffect(() => () => releaseSpeaker(sessionId), [sessionId]);

  // ออกจาก success แล้ว: ห่อมุมหมุนสะสมกลับมาอยู่ใน [-π, π] เพื่อไม่ให้หมุนย้อนหลายรอบ
  useEffect(() => {
    if (status !== 'success' && body.current) {
      const r = body.current.rotation.y % TWO_PI;
      body.current.rotation.y = r > Math.PI ? r - TWO_PI : r < -Math.PI ? r + TWO_PI : r;
    }
    anim.current.spin = body.current?.rotation.y ?? 0;
  }, [status]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05); // กันกระตุกตอนสลับแท็บ
    const t = state.clock.elapsedTime;
    const a = anim.current;
    if (!root.current || !body.current || !head.current) return;

    // ===== 1) Spawn: ขยายตัวแบบเด้ง =====
    if (a.spawnT < 1) {
      a.spawnT = Math.min(1, a.spawnT + dt * 1.4);
      spawn.current?.scale.setScalar(Math.max(0.001, easeOutBack(a.spawnT)));
    }

    // ===== 2) บิน: Vector3.lerp แบบ frame-rate independent =====
    // alpha = 1 - e^(-λ·dt) → ได้ความเร็วเท่ากันไม่ว่าจอจะ 60 หรือ 144 Hz
    target.set(placement.position[0], placement.position[1], placement.position[2]);
    const distance = root.current.position.distanceTo(target);
    root.current.position.lerp(target, 1 - Math.exp(-dt * 1.8));
    // ระหว่างบินไกล ๆ ยกตัวสูงขึ้น → เป็นวิถีโค้งแทนการไถลบนพื้น
    const flightLift = Math.min(distance, 3) * 0.35;

    // ===== 3) หันหน้า: lookAt ใส่ dummy แล้ว slerp quaternion ให้หมุนนุ่ม =====
    if (placement.lookAt) {
      lookTarget.set(placement.lookAt[0], root.current.position.y, placement.lookAt[2]);
    } else {
      lookTarget.set(state.camera.position.x, root.current.position.y, state.camera.position.z);
    }
    dummy.position.copy(root.current.position);
    dummy.lookAt(lookTarget);
    root.current.quaternion.slerp(dummy.quaternion, 1 - Math.exp(-dt * 4));

    // ===== 4) ท่าทางตามสถานะ (ค่าทั้งหมด damp เข้าหาเป้า → เปลี่ยนท่าแบบลื่น) =====
    let bobAmp = 0.06;
    let bobSpeed = 2;
    let bodyYaw = 0;
    let headTiltZ = 0;
    let headPitch = 0;
    let lx = 0.15, lz = -0.12, rx = 0.15, rz = 0.12; // แขนซ้าย/ขวา (rotation x, z)
    let shakeX = 0;
    let shakeRoll = 0;

    switch (status) {
      case 'idle':
        bobAmp = 0.14;
        bobSpeed = 1.2;
        bodyYaw = Math.sin(t * 0.55) * 0.35;
        lx = Math.sin(t * 1.2) * 0.12;
        rx = -Math.sin(t * 1.2) * 0.12;
        break;
      case 'thinking':
        bobAmp = 0.05;
        bobSpeed = 1;
        headTiltZ = 0.3 + Math.sin(t * 0.8) * 0.05;
        headPitch = -0.08;
        // แขนขวาชูขึ้นมาจับคาง
        rx = -2.25;
        rz = -0.75;
        break;
      case 'coding': {
        bobAmp = 0.03;
        bobSpeed = 2.5;
        headPitch = 0.22; // ก้มมองคีย์บอร์ด
        const type = (phase: number) => Math.sin(t * 28 + phase) * 0.14 + Math.sin(t * 17 + phase * 2) * 0.06;
        lx = -1.15 + type(0);
        rx = -1.15 + type(Math.PI);
        lz = 0.3;
        rz = -0.3;
        break;
      }
      case 'testing':
        bobAmp = 0.05;
        bobSpeed = 1.6;
        bodyYaw = Math.sin(t * 1.7) * 1.1; // หันซ้ายขวาสแกน
        rx = -1.5; // แขนขวายื่นเป็นเครื่องสแกน
        rz = -0.1;
        break;
      case 'success':
        bobAmp = 0.0;
        a.spin += dt * 6;
        lz = -2.6 + Math.sin(t * 9) * 0.25; // ชูแขนดีใจ + โบก
        rz = 2.6 - Math.sin(t * 9) * 0.25;
        lx = 0;
        rx = 0;
        break;
      case 'error':
        bobAmp = 0.02;
        shakeX = Math.sin(t * 70) * 0.07;
        shakeRoll = Math.sin(t * 55) * 0.06;
        headPitch = 0.3;
        lx = 0.1 + Math.sin(t * 60) * 0.1;
        rx = 0.1 - Math.sin(t * 60) * 0.1;
        break;
    }

    const b = body.current;
    const hop = status === 'success' ? Math.abs(Math.sin(t * 4.5)) * 0.35 : 0;
    const targetY = BODY_Y + flightLift + Math.sin(t * bobSpeed) * bobAmp + hop;
    b.position.y = damp(b.position.y, targetY, 8, dt);
    b.position.x = status === 'error' ? shakeX : damp(b.position.x, 0, 10, dt);
    b.rotation.z = status === 'error' ? shakeRoll : damp(b.rotation.z, 0, 10, dt);
    b.rotation.y = status === 'success' ? a.spin : damp(b.rotation.y, bodyYaw, 5, dt);

    head.current.rotation.z = damp(head.current.rotation.z, headTiltZ, 6, dt);
    head.current.rotation.x = damp(head.current.rotation.x, headPitch, 6, dt);

    // แขนตอนพิมพ์ต้องตอบสนองไว (λ สูง) ไม่งั้นการสั่นจะถูก damp จนเรียบ
    const armLambda = status === 'coding' || status === 'error' ? 30 : 7;
    if (leftArm.current && rightArm.current) {
      leftArm.current.rotation.x = damp(leftArm.current.rotation.x, lx, armLambda, dt);
      leftArm.current.rotation.z = damp(leftArm.current.rotation.z, lz, armLambda, dt);
      rightArm.current.rotation.x = damp(rightArm.current.rotation.x, rx, armLambda, dt);
      rightArm.current.rotation.z = damp(rightArm.current.rotation.z, rz, armLambda, dt);
    }

    // ===== 5) อุปกรณ์ประกอบตามสถานะ =====
    if (halo.current) {
      halo.current.visible = status === 'thinking';
      halo.current.rotation.z += dt * 9;
      halo.current.position.y = 0.58 + Math.sin(t * 3) * 0.03;
    }
    if (scanRing.current) {
      scanRing.current.visible = status === 'testing';
      scanRing.current.rotation.z += dt * 4;
      scanRing.current.position.y = Math.sin(t * 2.2) * 0.75; // วงแหวนเลื่อนขึ้นลงรอบตัว
    }
    if (keyboard.current) {
      keyboard.current.visible = status === 'coding';
      const m = (keyboard.current.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = 0.22 + Math.sin(t * 12) * 0.06 + Math.random() * 0.04;
    }

    // ไฟสถานะ: error กะพริบถี่, อื่น ๆ หายใจช้า ๆ
    const lightPower = status === 'error' ? (Math.sin(t * 26) > 0 ? 5 : 0.2) : 2.2 + Math.sin(t * 3) * 0.6;
    if (statusLightMat.current) statusLightMat.current.emissiveIntensity = lightPower;
    if (glowLight.current) glowLight.current.intensity = lightPower * 0.9;

    // ===== 6) Lip sync จาก AnalyserNode =====
    const level = getSpeakerLevel(sessionId);
    if (mouth.current && mouthMat.current) {
      mouth.current.scale.y = damp(mouth.current.scale.y, 0.35 + level * 2.8, 25, dt);
      mouth.current.scale.x = damp(mouth.current.scale.x, 1 - level * 0.2, 25, dt);
      mouthMat.current.emissiveIntensity = 0.5 + level * 6;
    }

    // ===== 7) กะพริบตา (เฉลี่ยทุก ~3.5 วิ แบบสุ่ม) + ตาสว่างวาบตามเสียง =====
    if (t > a.nextBlink) {
      a.blinkStart = t;
      a.nextBlink = t + 2.5 + Math.random() * 2;
    }
    const blinkPhase = (t - a.blinkStart) / 0.14;
    const blink = blinkPhase >= 0 && blinkPhase < 1 ? 0.1 + Math.abs(blinkPhase * 2 - 1) * 0.9 : 1;
    const mood = status === 'success' ? 0.45 : status === 'error' ? 0.6 : 1; // ยิ้มตาหยี / ตาหรี่
    const eyeScale = blink * mood * (1 + level * 0.3);
    if (eyeL.current && eyeR.current) {
      eyeL.current.scale.y = eyeScale;
      eyeR.current.scale.y = eyeScale;
    }
    eyeMaterial.emissiveIntensity = lerp(1.6, 4.5, level);
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(sessionId);
  };

  const metal = { color: '#e8ecf3', metalness: 0.35, roughness: 0.32 } as const;

  return (
    <group
      ref={root}
      position={spawnPosition}
      onClick={handleClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto';
      }}
    >
      <group ref={spawn} scale={0.001}>
        <group ref={body} position={[0, BODY_Y, 0]}>
          {/* ---------- ลำตัว ---------- */}
          <RoundedBox args={[0.78, 0.82, 0.56]} radius={0.14} smoothness={4} castShadow>
            <meshStandardMaterial {...metal} />
          </RoundedBox>
          <mesh position={[0, 0.12, 0.285]}>
            <boxGeometry args={[0.34, 0.12, 0.02]} />
            <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={1.5} toneMapped={false} />
          </mesh>
          <mesh position={[0, -0.12, 0.285]}>
            <boxGeometry args={[0.5, 0.04, 0.02]} />
            <meshStandardMaterial color={accent} />
          </mesh>
          {/* ไอพ่นใต้ตัว */}
          <mesh position={[0, -0.55, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.16, 0.26, 20]} />
            <meshStandardMaterial color="#1f2937" emissive={statusColor} emissiveIntensity={0.8} />
          </mesh>
          <pointLight ref={glowLight} position={[0, -0.7, 0]} color={statusColor} distance={3.5} intensity={2} />

          {/* ---------- หัว ---------- */}
          <group ref={head} position={[0, 0.8, 0]}>
            <RoundedBox args={[0.92, 0.68, 0.72]} radius={0.18} smoothness={4} castShadow>
              <meshStandardMaterial {...metal} />
            </RoundedBox>
            {/* visor กระจกดำ */}
            <mesh position={[0, 0, 0.35]}>
              <boxGeometry args={[0.76, 0.44, 0.04]} />
              <meshStandardMaterial color="#0a0f1e" metalness={0.6} roughness={0.15} />
            </mesh>
            {/* ตา LED (ใช้ material ร่วมกัน → สว่างพร้อมกันทั้งคู่) */}
            <mesh ref={eyeL} position={[-0.17, 0.06, 0.375]} material={eyeMaterial}>
              <boxGeometry args={[0.12, 0.15, 0.02]} />
            </mesh>
            <mesh ref={eyeR} position={[0.17, 0.06, 0.375]} material={eyeMaterial}>
              <boxGeometry args={[0.12, 0.15, 0.02]} />
            </mesh>
            {/* ปาก LED – scale.y ตามความดังเสียง */}
            <mesh ref={mouth} position={[0, -0.12, 0.375]} scale={[1, 0.35, 1]}>
              <boxGeometry args={[0.22, 0.08, 0.02]} />
              <meshStandardMaterial ref={mouthMat} color="#fef9c3" emissive="#fde047" emissiveIntensity={0.5} toneMapped={false} />
            </mesh>
            {/* หู */}
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * 0.48, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.12, 0.12, 0.08, 20]} />
                <meshStandardMaterial color={accent} metalness={0.4} roughness={0.4} />
              </mesh>
            ))}
            {/* เสาอากาศ + ไฟสถานะ */}
            <mesh position={[0, 0.45, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 0.22, 8]} />
              <meshStandardMaterial color="#94a3b8" />
            </mesh>
            <mesh position={[0, 0.6, 0]}>
              <sphereGeometry args={[0.075, 16, 16]} />
              <meshStandardMaterial
                ref={statusLightMat}
                color={statusColor}
                emissive={statusColor}
                emissiveIntensity={2}
                toneMapped={false}
              />
            </mesh>
            {/* Halo วงแหวนความคิด */}
            <mesh ref={halo} position={[0, 0.58, 0]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
              <torusGeometry args={[0.42, 0.025, 8, 48, Math.PI * 1.6]} />
              <meshStandardMaterial color="#c084fc" emissive="#a855f7" emissiveIntensity={3} toneMapped={false} />
            </mesh>
          </group>

          {/* ---------- ไหล่ (anchor ของ CollabBeam) + แขน ---------- */}
          <group ref={leftShoulder} position={[-0.5, 0.28, 0]}>
            <group ref={leftArm}>
              <mesh>
                <sphereGeometry args={[0.11, 16, 16]} />
                <meshStandardMaterial color={accent} />
              </mesh>
              <RoundedBox args={[0.16, 0.5, 0.16]} radius={0.07} position={[0, -0.3, 0]}>
                <meshStandardMaterial {...metal} />
              </RoundedBox>
              <mesh position={[0, -0.6, 0]}>
                <sphereGeometry args={[0.1, 16, 16]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.3} />
              </mesh>
            </group>
          </group>
          <group ref={rightShoulder} position={[0.5, 0.28, 0]}>
            <group ref={rightArm}>
              <mesh>
                <sphereGeometry args={[0.11, 16, 16]} />
                <meshStandardMaterial color={accent} />
              </mesh>
              <RoundedBox args={[0.16, 0.5, 0.16]} radius={0.07} position={[0, -0.3, 0]}>
                <meshStandardMaterial {...metal} />
              </RoundedBox>
              <mesh position={[0, -0.6, 0]}>
                <sphereGeometry args={[0.1, 16, 16]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.3} />
              </mesh>
            </group>
          </group>

          {/* ---------- คีย์บอร์ดโฮโลแกรม (coding) ---------- */}
          <group ref={keyboard} position={[0, -0.18, 0.62]} rotation={[-1.05, 0, 0]} visible={false}>
            <mesh>
              <planeGeometry args={[1.05, 0.42]} />
              <meshBasicMaterial
                color="#22c55e"
                transparent
                opacity={0.25}
                side={THREE.DoubleSide}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            <mesh position={[0, 0, 0.002]}>
              <planeGeometry args={[1.05, 0.42, 12, 4]} />
              <meshBasicMaterial color="#86efac" wireframe transparent opacity={0.6} depthWrite={false} />
            </mesh>
          </group>

          {/* ---------- วงแหวนสแกน (testing) ---------- */}
          <mesh ref={scanRing} rotation={[Math.PI / 2, 0, 0]} visible={false}>
            <torusGeometry args={[0.85, 0.018, 8, 64]} />
            <meshStandardMaterial color="#fdba74" emissive="#f97316" emissiveIntensity={3} toneMapped={false} />
          </mesh>
        </group>
      </group>

      {/* วงเลือก (ไม่หมุนตามตัว) */}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.75, 0.82, 48]} />
          <meshBasicMaterial color="#e2e8f0" transparent opacity={0.7} />
        </mesh>
      )}

      {status === 'success' && <SuccessEffect />}

      {/* ---------- 3D HUD ---------- */}
      <Html position={[0, 3.05, 0]} center distanceFactor={9} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div
          className="w-60 select-none rounded-xl border bg-slate-950/85 px-3 py-2 text-[11px] leading-snug text-slate-200 shadow-xl backdrop-blur"
          style={{ borderColor: statusColor, boxShadow: `0 0 18px ${statusColor}55` }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-semibold" style={{ color: statusColor }}>
              <span
                className={`inline-block h-2 w-2 rounded-full ${status === 'error' ? 'animate-ping' : 'animate-pulse'}`}
                style={{ background: statusColor }}
              />
              {STATUS_META[status].label}
            </span>
            <span className="font-mono text-[10px] text-slate-400">{sessionId.slice(0, 8)}</span>
          </div>
          <div className="mt-1 truncate text-[12.5px] font-semibold text-white">{agent.task || '—'}</div>
          <div className="mt-1 flex items-center gap-1.5 text-slate-300">
            <User size={11} style={{ color: accent }} />
            <span className="truncate">{agent.author}</span>
          </div>
          {agent.file && (
            <div className="mt-0.5 flex items-center gap-1.5 text-slate-400">
              <FileCode2 size={11} />
              <span className="truncate font-mono text-[10px]">{agent.file}</span>
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

export default memo(Agent3D);
