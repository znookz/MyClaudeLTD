import { useMemo, useRef, type ComponentRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { getAnchors } from './utils/registry';

interface CollabBeamProps {
  fromId: string;
  toId: string;
  color?: string;
}

const SEGMENTS = 32;
const PACKETS = 3;
/** ระยะห่างไหล่ที่ถือว่า "มารวมตัวแล้ว" — beam จะค่อย ๆ ปรากฏเมื่อเข้าใกล้กว่านี้ */
const SHOW_DISTANCE = 4;

type LineRef = ComponentRef<typeof Line>;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _aL = new THREE.Vector3();
const _aR = new THREE.Vector3();
const _bL = new THREE.Vector3();
const _bR = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _perp = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * เขียนจุดลง buffer เดิมของ Line2 แบบ in-place
 * (ถ้าเรียก setPositions()/computeLineDistances() ทุกเฟรม three จะสร้าง GPU buffer ใหม่ทุกครั้ง → หน่วยความจำรั่ว)
 * LineGeometry เก็บเป็น "segment": [x1,y1,z1,x2,y2,z2] ต่อช่วง และระยะสะสม [d1,d2] ต่อช่วงสำหรับเส้นประ
 */
function writeLine(line: LineRef, flat: Float32Array, withDistances: boolean) {
  const geo = line.geometry;
  const start = geo.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute | undefined;
  if (!start) {
    geo.setPositions(flat);
    return;
  }
  const arr = start.data.array as Float32Array;
  for (let i = 0; i < SEGMENTS - 1; i++) {
    // จุด i และ i+1 อยู่ติดกันใน flat อยู่แล้ว → copy 6 ค่าต่อช่วงได้เลย
    arr.set(flat.subarray(i * 3, i * 3 + 6), i * 6);
  }
  start.data.needsUpdate = true;

  if (!withDistances) return;
  const dist = geo.getAttribute('instanceDistanceStart') as THREE.InterleavedBufferAttribute | undefined;
  if (!dist) {
    line.computeLineDistances();
    return;
  }
  const d = dist.data.array as Float32Array;
  let acc = 0;
  for (let i = 0; i < SEGMENTS - 1; i++) {
    const j = i * 3;
    const dx = flat[j + 3] - flat[j];
    const dy = flat[j + 4] - flat[j + 1];
    const dz = flat[j + 5] - flat[j + 2];
    d[i * 2] = acc;
    acc += Math.sqrt(dx * dx + dy * dy + dz * dz);
    d[i * 2 + 1] = acc;
  }
  dist.data.needsUpdate = true;
}

/**
 * ลำแสงส่งข้อมูลระหว่างหัวไหล่ 2 ตัว
 *
 * หลักการ: ตำแหน่งไหล่เปลี่ยนทุกเฟรม (Agent กำลังบิน/โยกตัว) จึงไม่ส่งจุดผ่าน React props
 * แต่เขียนลง geometry ของ Line2 ตรง ๆ ใน useFrame:
 *   1. หาไหล่ข้างที่ใกล้อีกตัวที่สุด (จาก registry)
 *   2. สร้างเส้นโค้งพาราโบลาเล็ก ๆ + คลื่นไฟฟ้า (sin ที่เลื่อนตามเวลา)
 *   3. เขียนลง buffer เดิม (writeLine) แล้วเลื่อน dashOffset = เส้นประวิ่ง
 */
export default function CollabBeam({ fromId, toId, color = '#67e8f9' }: CollabBeamProps) {
  const dashRef = useRef<LineRef>(null);
  const glowRef = useRef<LineRef>(null);
  const groupRef = useRef<THREE.Group>(null);
  const packetRefs = useRef<(THREE.Mesh | null)[]>([]);

  // จุดเริ่มต้น (จะถูกเขียนทับทุกเฟรม) — จำนวนจุดต้องคงที่ตลอด
  const initialPoints = useMemo(
    () => Array.from({ length: SEGMENTS }, (_, i) => new THREE.Vector3(i * 0.01, 0, 0)),
    [],
  );
  const flat = useMemo(() => new Float32Array(SEGMENTS * 3), []);
  const pts = useMemo(() => Array.from({ length: SEGMENTS }, () => new THREE.Vector3()), []);
  const opacity = useRef(0);

  useFrame((state, delta) => {
    const A = getAnchors(fromId);
    const B = getAnchors(toId);
    const group = groupRef.current;
    if (!group) return;
    if (!A || !B) {
      group.visible = false;
      return;
    }

    // 1) เลือกไหล่ที่หันเข้าหากัน
    A.left.getWorldPosition(_aL);
    A.right.getWorldPosition(_aR);
    B.left.getWorldPosition(_bL);
    B.right.getWorldPosition(_bR);
    const bCenter = _mid.copy(_bL).add(_bR).multiplyScalar(0.5);
    _a.copy(_aL.distanceToSquared(bCenter) < _aR.distanceToSquared(bCenter) ? _aL : _aR);
    _b.copy(_bL.distanceToSquared(_a) < _bR.distanceToSquared(_a) ? _bL : _bR);

    // fade ตามระยะ: ยังบินไม่ถึงก็ยังไม่เชื่อม
    const dist = _a.distanceTo(_b);
    const targetOpacity = dist < SHOW_DISTANCE ? 1 : 0;
    opacity.current += (targetOpacity - opacity.current) * Math.min(1, delta * 3);
    group.visible = opacity.current > 0.02;
    if (!group.visible) return;

    // 2) เส้นโค้ง + คลื่นไฟฟ้า
    const t = state.clock.elapsedTime;
    _perp.subVectors(_b, _a).cross(UP).normalize();
    for (let i = 0; i < SEGMENTS; i++) {
      const u = i / (SEGMENTS - 1);
      const envelope = Math.sin(u * Math.PI); // ปลายทั้งสองนิ่ง ตรงกลางสั่นมากสุด
      const p = pts[i].lerpVectors(_a, _b, u);
      p.y += envelope * 0.25; // โค้งขึ้นเล็กน้อย
      const zap = Math.sin(u * 22 - t * 18) * 0.045 + Math.sin(u * 51 + t * 31) * 0.02;
      p.addScaledVector(_perp, zap * envelope);
      p.y += Math.cos(u * 17 + t * 23) * 0.03 * envelope;
      flat[i * 3] = p.x;
      flat[i * 3 + 1] = p.y;
      flat[i * 3 + 2] = p.z;
    }

    // 3) อัปเดตเส้น
    if (dashRef.current) writeLine(dashRef.current, flat, true);
    if (glowRef.current) writeLine(glowRef.current, flat, false);
    if (dashRef.current) {
      dashRef.current.material.dashOffset -= delta * 2.2;
      dashRef.current.material.opacity = opacity.current;
    }
    if (glowRef.current) {
      glowRef.current.material.opacity = opacity.current * (0.25 + Math.random() * 0.1);
    }

    // แพ็กเก็ตข้อมูลวิ่งไปตามเส้น
    packetRefs.current.forEach((m, k) => {
      if (!m) return;
      const u = (t * 0.55 + k / PACKETS) % 1;
      const idx = Math.min(SEGMENTS - 2, Math.floor(u * (SEGMENTS - 1)));
      const frac = u * (SEGMENTS - 1) - idx;
      m.position.lerpVectors(pts[idx], pts[idx + 1], frac);
      m.scale.setScalar(opacity.current * (0.8 + Math.sin(t * 20 + k) * 0.2));
    });
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* ชั้นเรืองแสงด้านหลัง: เส้นทึบหนา โปร่งแสง */}
      <Line
        ref={glowRef}
        points={initialPoints}
        color={color}
        lineWidth={7}
        frustumCulled={false}
        transparent
        opacity={0}
        depthWrite={false}
        toneMapped={false}
      />
      {/* ชั้นหลัก: เส้นประวิ่ง */}
      <Line
        ref={dashRef}
        points={initialPoints}
        color="#ffffff"
        lineWidth={2.5}
        dashed
        dashSize={0.18}
        gapSize={0.1}
        frustumCulled={false}
        transparent
        opacity={0}
        depthWrite={false}
        toneMapped={false}
      />
      {Array.from({ length: PACKETS }).map((_, k) => (
        <mesh
          key={k}
          ref={(m) => {
            packetRefs.current[k] = m;
          }}
        >
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
