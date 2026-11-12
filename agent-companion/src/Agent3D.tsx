import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { Bot, CornerDownRight, FileCode2, MapPin, User } from 'lucide-react';
import { BodyWear, HeadWear } from './Outfit';
import SuccessEffect from './SuccessEffect';
import { ACTIVITY_ICON } from './components/activityIcons';
import { ACTIVITY_META, STATUS_META, type AgentState } from './types';
import type { Placement } from './utils/layout';
import { bumpStat } from './utils/stats';
import { DOOR, POIS, claimPoi, findPath, markPoiPlaying, releasePoi, type Vec3 } from './utils/office';
import { racingTelemetry } from './utils/racingGame';
import { HAT_LIFT, type Outfit } from './utils/outfits';
import { authorColor } from './utils/people';
import { registerAnchors, unregisterAnchors } from './utils/registry';
import { getSpeakerLevel, releaseSpeaker } from './utils/sound';

interface Agent3DProps {
  agent: AgentState;
  placement: Placement;
  /** ชุดแต่งตัวประจำตัว (แต่ละ session ไม่ซ้ำกัน) */
  outfit: Outfit;
  selected: boolean;
  /** จางลงเมื่อไม่ตรงกับตัวกรองสถานะ */
  dimmed?: boolean;
  onSelect: (sessionId: string) => void;
  /** หุ่นจิ๋ว = sub-agent ของตัวอื่น: ตัวเล็ก, ป้ายย่อ, โผล่ออกมาจากตัวแม่ */
  mini?: boolean;
  /** ชนิดของ sub-agent (แสดงบนป้ายของหุ่นจิ๋ว) */
  subType?: string;
  /** จุดเกิด (ไม่ระบุ = เดินเข้ามาจากประตูห้อง) */
  spawnAt?: Vec3;
  /** คลิกแล้วเลือก session ไหน (หุ่นจิ๋ว → เลือกตัวแม่) */
  selectId?: string;
}

const MINI_SCALE = 0.56;

const { damp, lerp } = THREE.MathUtils;
const BODY_Y = 1.17;
const TWO_PI = Math.PI * 2;
const DIM_OPACITY = 0.2;
const WALK_SPEED = 1.7; // หน่วย/วินาที
const STRIDE_RATE = 5.2; // เฟสก้าวเดิน (rad) ต่อหน่วยระยะทาง
const SIT_DROP = 0.3; // ตัวลดลงเท่าไรตอนนั่ง
const LEAVE_MS = 10 * 60_000; // สำเร็จค้างไว้นานเท่านี้ แล้วเดินออกจากห้องไป
const EXIT_DEST = { position: DOOR.spawn, lookAt: null, pose: 'stand' } as const;
const FATIGUE_FULL_MS = 8 * 60_000; // ทำงานต่อเนื่องเท่านี้ = เหนื่อยเต็มที่ (ใช้เลือกจุดพัก + ความนานของการพัก)
const CELEBRATE_MS = 60_000; // ฉลองความสำเร็จนานเท่านี้ แล้วกลับไปยืนท่าสแตนด์บาย (ป้ายยังเป็น "สำเร็จ")

interface Dest {
  position: Vec3;
  lookAt: Vec3 | null;
  pose: 'sit' | 'stand';
}

// แผงโฮโลแกรมข้างตัว (อ่านโค้ด / รันคำสั่ง): เส้นข้อความ 5 บรรทัด ความกว้างตั้งต้นของแต่ละบรรทัด
const HOLO_LINES = [0.5, 0.38, 0.46, 0.3, 0.42];

const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

function Agent3D({
  agent,
  placement,
  outfit,
  selected,
  dimmed = false,
  onSelect,
  mini = false,
  subType,
  spawnAt,
  selectId,
}: Agent3DProps) {
  const { sessionId, status, activity } = agent;
  const statusColor = STATUS_META[status].color;
  // สำเร็จครบ ~1 นาทีแล้ว: สถานะ/สี/ป้ายยังเป็น success แต่ท่าทางกลับเป็นแบบสแตนด์บาย
  const [settled, setSettled] = useState(false);
  // สำเร็จครบ ~10 นาที: เดินออกประตูห้องไป (leaving) → ถึงประตูแล้วหายตัว (gone); มีงานใหม่ก็เดินกลับเข้ามา
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    setSettled(false);
    setLeaving(false);
    setGone(false);
    if (status !== 'success') return;
    const settleTimer = setTimeout(() => setSettled(true), CELEBRATE_MS);
    const leaveTimer = setTimeout(() => setLeaving(true), LEAVE_MS);
    return () => {
      clearTimeout(settleTimer);
      clearTimeout(leaveTimer);
    };
  }, [status]);
  const pose = status === 'success' && settled ? 'idle' : status;
  // ฉลองเสร็จแล้วก็เดินเล่นในห้องได้เหมือนตอนสแตนด์บาย
  const wander = !leaving && (placement.wander || (status === 'success' && settled && !placement.groupKey));
  const activityMeta = ACTIVITY_META[activity];
  const ActivityIcon = ACTIVITY_ICON[activity];
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
  const leftHip = useRef<THREE.Group>(null);
  const rightHip = useRef<THREE.Group>(null);
  const leftKnee = useRef<THREE.Group>(null);
  const rightKnee = useRef<THREE.Group>(null);
  const statusLightMat = useRef<THREE.MeshStandardMaterial>(null);
  const glowLight = useRef<THREE.PointLight>(null);
  // อุปกรณ์ประกอบท่าทางของ activity ต่าง ๆ
  const holo = useRef<THREE.Group>(null);
  const holoMat = useRef<THREE.MeshBasicMaterial>(null);
  // เส้นข้อความทุกบรรทัดใช้ material ร่วมกัน (เปลี่ยนสีตาม activity ครั้งเดียว)
  const holoBarMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#60a5fa', transparent: true, opacity: 0.85, depthWrite: false }),
    [],
  );
  useEffect(() => () => holoBarMaterial.dispose(), [holoBarMaterial]);
  const holoBars = useRef<(THREE.Mesh | null)[]>([]);
  const magnifier = useRef<THREE.Group>(null);
  const cue = useRef<THREE.Group>(null);
  const gamepad = useRef<THREE.Mesh>(null);
  const cup = useRef<THREE.Group>(null);
  const globe = useRef<THREE.Group>(null);
  const pingRing = useRef<THREE.Mesh>(null);
  const pingMat = useRef<THREE.MeshBasicMaterial>(null);
  const holoColor = useMemo(() => new THREE.Color(), []);

  // ---------- state ภายในที่ไม่ต้อง re-render ----------
  const anim = useRef({
    spawnT: 0,
    spin: 0,
    nextBlink: 1 + Math.random() * 3,
    blinkStart: -10,
    // ---- การเดิน ----
    path: [] as Vec3[],
    destKey: '',
    arrived: false,
    walk: 0, // 0..1 ผสมท่าเดิน
    phase: 0, // เฟสก้าวขา
    sit: 0, // 0..1 ผสมท่านั่ง
    heading: new THREE.Vector3(0, 0, 1),
    // ---- เดินเล่นตอนว่าง ----
    poi: -1,
    wanderDest: null as Dest | null,
    nextWanderAt: 2 + Math.random() * 3,
    leaveAt: 0,
    // ---- อารมณ์ (ใช้เลือกจุดพัก) ----
    lastPoi: -1,
    lastWork: 'idle' as string,
    workMs: 0, // เวลาทำงานสะสมตั้งแต่พักครั้งก่อน
    workStart: 0, // 0 = ไม่ได้ทำงานอยู่
    stress: 0,
  });
  // จับอารมณ์จาก activity: ทำงานต่อเนื่อง → เหนื่อย · failed → เครียด
  useEffect(() => {
    const a = anim.current;
    const now = Date.now();
    const working = status === 'thinking' || status === 'coding' || status === 'testing' || status === 'error';
    if (working) {
      if (!a.workStart) a.workStart = now;
      a.lastWork = activity;
      if (activity === 'failed') a.stress = Math.min(1, a.stress + 0.34);
    } else {
      if (a.workStart) {
        a.workMs += now - a.workStart;
        a.workStart = 0;
      }
      if (status === 'success') a.lastWork = 'done';
    }
  }, [status, activity]);
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
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // ตำแหน่งเกิด: หน้าประตูห้อง → เดินเข้ามาหาโต๊ะ (เลื่อนเล็กน้อยตามลำดับ ไม่ให้ซ้อนกัน)
  const spawnPosition = useMemo<[number, number, number]>(
    () => (spawnAt ? [spawnAt[0], 0, spawnAt[2]] : [DOOR.spawn[0], 0, DOOR.spawn[2] + (Math.random() - 0.5) * 0.4]),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ใช้ค่าตอน mount เท่านั้น
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
  useEffect(() => () => releasePoi(sessionId), [sessionId]);

  // ตัวกรองสถานะ: ทำให้ตัวที่ไม่ตรงโปร่งใส (เก็บค่า opacity เดิมไว้ใน userData เพื่อคืนค่า)
  useEffect(() => {
    const g = root.current;
    if (!g) return;
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
        if (mat.userData.baseOpacity === undefined) {
          mat.userData.baseOpacity = mat.opacity;
          mat.userData.baseTransparent = mat.transparent;
        }
        mat.transparent = dimmed || mat.userData.baseTransparent;
        mat.opacity = dimmed ? mat.userData.baseOpacity * DIM_OPACITY : mat.userData.baseOpacity;
        mat.needsUpdate = true;
      }
    });
  }, [dimmed, status, outfit]);

  // ออกจาก success แล้ว: ห่อมุมหมุนสะสมกลับมาอยู่ใน [-π, π] เพื่อไม่ให้หมุนย้อนหลายรอบ
  useEffect(() => {
    if (pose !== 'success' && body.current) {
      const r = body.current.rotation.y % TWO_PI;
      body.current.rotation.y = r > Math.PI ? r - TWO_PI : r < -Math.PI ? r + TWO_PI : r;
    }
    anim.current.spin = body.current?.rotation.y ?? 0;
  }, [pose]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05); // กันกระตุกตอนสลับแท็บ
    const t = state.clock.elapsedTime;
    const a = anim.current;
    if (!root.current || !body.current || !head.current) return;

    // ===== 1) Spawn: ขยายตัวแบบเด้ง =====
    if (!leaving && a.spawnT < 1) {
      a.spawnT = Math.min(1, a.spawnT + dt * 1.4);
      spawn.current?.scale.setScalar(Math.max(0.001, easeOutBack(a.spawnT)));
    }

    // ===== 2) เลือกจุดหมาย: ปกติตาม placement; ถ้าว่างอยู่ (idle) จะเดินเล่นไปจุดต่าง ๆ ในห้อง =====
    const pos = root.current.position;
    if (!wander) {
      if (a.poi >= 0) {
        releasePoi(sessionId);
        a.poi = -1;
      }
      a.wanderDest = null;
      a.leaveAt = 0;
    } else {
      if (a.wanderDest && a.arrived && a.leaveAt === 0) {
        // นับสถิติ: มาถึงจุดพักผ่อน/ร้านกาแฟ
        if (a.poi >= 0 && !mini) {
          if (POIS[a.poi].act === 'coffee') bumpStat('coffee');
          if (POIS[a.poi].lounge) bumpStat('breaks');
        }
        // ยืนอยู่สักพัก (ในห้องพักผ่อนเล่นนานกว่า; เหนื่อย/เครียดมาก → พักนานขึ้นถึง ~2 เท่า)
        const need = 1 + Math.max(Math.min(1, a.workMs / FATIGUE_FULL_MS), a.stress);
        a.leaveAt = t + (a.poi >= 0 && POIS[a.poi].lounge ? 12 + Math.random() * 14 : 4 + Math.random() * 6) * need;
        // พักแล้ว → ความเหนื่อยลดลงครึ่งหนึ่ง ความเครียดหาย
        a.workMs *= 0.5;
        a.stress = 0;
      }
      if (a.wanderDest && a.arrived && t >= a.leaveAt) {
        releasePoi(sessionId);
        a.poi = -1;
        a.wanderDest = null;
        a.leaveAt = 0;
        a.nextWanderAt = Math.random() < 0.5 ? t : t + 3 + Math.random() * 5; // ไปที่ใหม่เลย หรือกลับไปยืนรอที่โต๊ะ
      }
      if (!a.wanderDest && a.arrived && t >= a.nextWanderAt) {
        const idx = claimPoi(sessionId, {
          last: a.lastWork,
          fatigue: Math.min(1, a.workMs / FATIGUE_FULL_MS),
          stress: a.stress,
          lastPoi: a.lastPoi,
        });
        if (idx >= 0) {
          const poi = POIS[idx];
          a.poi = idx;
          a.lastPoi = idx;
          a.wanderDest = { position: poi.stand, lookAt: poi.lookAt, pose: poi.pose };
        } else {
          a.nextWanderAt = t + 4;
        }
      }
    }
    const dest: Dest = leaving ? EXIT_DEST : wander && a.wanderDest ? a.wanderDest : placement;

    // ===== 3) เดินตามเส้นทาง (A* เลี่ยงเฟอร์นิเจอร์) ด้วยความเร็วคงที่ =====
    const destKey = `${dest.position[0].toFixed(2)},${dest.position[2].toFixed(2)}`;
    if (destKey !== a.destKey) {
      a.destKey = destKey;
      a.arrived = false;
      a.path = findPath([pos.x, 0, pos.z], dest.position);
    }

    let moving = false;
    if (a.path.length > 0) {
      const wp = a.path[0];
      const dx = wp[0] - pos.x;
      const dz = wp[2] - pos.z;
      const d = Math.hypot(dx, dz);
      const step = WALK_SPEED * dt;
      moving = true;
      if (d > 1e-4) a.heading.set(dx / d, 0, dz / d);
      if (d <= step) {
        pos.x = wp[0];
        pos.z = wp[2];
        a.path.shift();
        a.phase += d * STRIDE_RATE;
      } else {
        pos.x += (dx / d) * step;
        pos.z += (dz / d) * step;
        a.phase += step * STRIDE_RATE;
      }
    } else {
      a.arrived = true;
    }
    // ถึงประตูแล้ว: หดตัวหายออกจากห้อง
    if (leaving && a.arrived && a.spawnT > 0) {
      a.spawnT = Math.max(0, a.spawnT - dt * 2.5);
      spawn.current?.scale.setScalar(Math.max(0.001, a.spawnT));
      if (a.spawnT === 0) setGone(true);
    }
    a.walk = damp(a.walk, moving ? 1 : 0, 10, dt);
    const walk = a.walk;
    // นั่งเมื่อถึงเก้าอี้แล้วเท่านั้น (ระหว่างเดินยังยืน)
    a.sit = damp(a.sit, dest.pose === 'sit' && a.arrived ? 1 : 0, 6, dt);
    const sit = a.sit;

    // ===== 4) หันหน้า: ระหว่างเดินหันตามทิศทาง; ถึงแล้วหันไปทาง lookAt (หรือเข้าหากล้อง) =====
    if (moving && walk > 0.05) {
      lookTarget.set(pos.x + a.heading.x * 3, pos.y, pos.z + a.heading.z * 3);
    } else if (dest.lookAt) {
      lookTarget.set(dest.lookAt[0], pos.y, dest.lookAt[2]);
    } else {
      lookTarget.set(state.camera.position.x, pos.y, state.camera.position.z);
    }
    dummy.position.copy(pos);
    dummy.lookAt(lookTarget);
    root.current.quaternion.slerp(dummy.quaternion, 1 - Math.exp(-dt * (moving ? 9 : 4)));

    // ===== 5) ท่าทางตามสถานะ (ค่าทั้งหมด damp เข้าหาเป้า → เปลี่ยนท่าแบบลื่น) =====
    let bobAmp = 0.02;
    let bobSpeed = 2;
    let bodyYaw = 0;
    let headTiltZ = 0;
    let headPitch = 0;
    let headYaw = 0;
    let lx = 0.15, lz = -0.12, rx = 0.15, rz = 0.12; // แขนซ้าย/ขวา (rotation x, z)
    let shakeX = 0;
    let shakeRoll = 0;

    switch (pose) {
      case 'idle':
        bobAmp = 0.012; // หายใจเบา ๆ (ยืนบนพื้นแล้ว ไม่ลอย)
        bobSpeed = 1.6;
        bodyYaw = Math.sin(t * 0.55) * 0.3;
        lx = Math.sin(t * 1.2) * 0.12;
        rx = -Math.sin(t * 1.2) * 0.12;
        if (activity === 'waiting') {
          // รออนุญาต/รอ input: ยกมือขวาโบกเรียกให้คนมาดู
          bodyYaw = 0;
          headPitch = -0.12;
          headTiltZ = -0.1;
          rx = 0;
          rz = 2.45 + Math.sin(t * 7) * 0.32;
        }
        break;
      case 'thinking':
        bobAmp = 0.01;
        bobSpeed = 1;
        headTiltZ = 0.3 + Math.sin(t * 0.8) * 0.05;
        headPitch = -0.08;
        // planning (ค่าเริ่มต้น): แขนขวาชูขึ้นมาจับคาง
        rx = -2.25;
        rz = -0.75;
        if (activity === 'reading') {
          // ถือเอกสาร: ก้มหน้า กวาดสายตาซ้าย-ขวาช้า ๆ
          headTiltZ = 0;
          headPitch = 0.34;
          headYaw = Math.sin(t * 1.3) * 0.28;
          lx = -1.2;
          rx = -1.2;
          lz = 0.4;
          rz = -0.4;
        } else if (activity === 'searching') {
          // ส่องแว่นขยาย: แขนขวายื่นไปข้างหน้า กวาดหัวหาเป้าหมาย
          headTiltZ = 0;
          headPitch = 0.12;
          headYaw = Math.sin(t * 2.4) * 0.45;
          rx = -1.75 + Math.sin(t * 3.1) * 0.12;
          rz = -0.12;
          lx = 0.1;
          lz = -0.2;
        } else if (activity === 'web') {
          // ท่องเว็บ: ชี้ไปที่ลูกโลกข้างตัวแล้วเงยหน้ามอง
          bobSpeed = 1.6;
          headTiltZ = -0.12;
          headPitch = -0.14;
          headYaw = 0.35 + Math.sin(t * 1.1) * 0.08;
          rx = -1.95 + Math.sin(t * 2.2) * 0.1;
          rz = -0.5;
          lx = 0.1;
          lz = -0.2;
        } else if (activity === 'delegating') {
          // สั่งงาน sub-agent: ชี้นิ้วออกไป อีกมือโบกสั่ง ตัวหันกวาดช้า ๆ
          bobSpeed = 1.8;
          headTiltZ = 0;
          headPitch = -0.05;
          bodyYaw = Math.sin(t * 0.9) * 0.5;
          rx = -1.55 + Math.sin(t * 4) * 0.14;
          rz = -0.55;
          lx = -0.7 + Math.sin(t * 3) * 0.3;
          lz = -0.7;
        }
        break;
      case 'coding': {
        bobAmp = 0.008;
        bobSpeed = 2.5;
        headPitch = 0.22; // ก้มมองคีย์บอร์ด
        // running: พิมพ์เป็นช่วง ๆ (พิมพ์คำสั่ง → รอผล) ส่วน writing พิมพ์รัวต่อเนื่อง
        const burst = activity === 'running' ? (Math.sin(t * 1.6) > -0.15 ? 1 : 0.12) : 1;
        const type = (phase: number) =>
          (Math.sin(t * 28 + phase) * 0.14 + Math.sin(t * 17 + phase * 2) * 0.06) * burst;
        lx = -1.15 + type(0);
        rx = -1.15 + type(Math.PI);
        lz = 0.3;
        rz = -0.3;
        if (activity === 'running') headPitch = 0.12 + (burst < 1 ? -0.08 : 0); // เงยหน้าดูผลตอนรอ
        break;
      }
      case 'testing':
        bobAmp = 0.01;
        bobSpeed = 1.6;
        bodyYaw = Math.sin(t * 1.7) * (0.55 + 0.5 * (1 - sit)); // หันซ้ายขวาสแกน (นั่งอยู่หมุนน้อยกว่า)
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
        bobAmp = 0.01;
        shakeX = Math.sin(t * 70) * 0.07;
        shakeRoll = Math.sin(t * 55) * 0.06;
        headPitch = 0.3;
        lx = 0.1 + Math.sin(t * 60) * 0.1;
        rx = 0.1 - Math.sin(t * 60) * 0.1;
        break;
    }

    // ===== 5.1) ท่าเล่นในห้องพักผ่อน (ถึงจุดแล้วเท่านั้น และยังว่างอยู่) =====
    const act = pose === 'idle' && wander && a.wanderDest && a.arrived && a.poi >= 0 ? POIS[a.poi].act : undefined;
    if (act && a.poi >= 0) markPoiPlaying(a.poi); // จอเกมเดินเฉพาะตอนมีคนเล่น
    let lean = 0; // เอนตัวไปข้างหน้า
    let buzz = 0; // สั่นเบา ๆ (ตัวสั่นตอนขับ rig)
    let cueSlide = 0;
    let sip = 0; // จังหวะยกแก้วกาแฟจิบ 0..1
    if (act === 'arcade') {
      // ตู้เกม: มือซ้ายโยกจอยสติ๊ก มือขวากดปุ่มรัว
      bodyYaw = Math.sin(t * 2.3) * 0.07;
      headPitch = 0.08;
      lx = -1.05 + Math.sin(t * 6) * 0.1;
      lz = 0.28 + Math.sin(t * 4.3) * 0.12;
      rx = -1.05 + (Math.sin(t * 21) > 0.2 ? -0.16 : 0);
      rz = -0.28;
    } else if (act === 'pool') {
      // โต๊ะพูล: ก้มเล็ง มือซ้ายวางเป็นสะพาน มือขวาชักไม้คิวไปมา
      const s = Math.sin(t * 2.4);
      cueSlide = s;
      lean = 0.42;
      bodyYaw = 0;
      headPitch = -0.3;
      lx = -1.35;
      lz = 0.32;
      rx = 0.4 - s * 0.26;
      rz = 0.04;
    } else if (act === 'console') {
      // เกมคอนโซล: นั่งถือจอยสองมือ เอนตัวตามเกม
      bodyYaw = Math.sin(t * 1.3) * 0.1;
      headPitch = 0.04;
      lx = -0.95 + Math.sin(t * 15) * 0.04;
      rx = -0.95 + Math.sin(t * 19 + 1) * 0.05;
      lz = 0.42;
      rz = -0.42;
    } else if (act === 'racing') {
      // Racing Rig: มือจับพวงมาลัย ตัวโยกตามโค้งจริงของเกม · ตอนเปลี่ยนเกียร์ มือซ้ายเอื้อมไปแตะคันเกียร์
      const T = racingTelemetry;
      const sh = Math.sin(Math.min(1, T.shiftPulse) * Math.PI); // 0→1→0 ช่วงเปลี่ยนเกียร์
      bodyYaw = T.steer * 0.1;
      headPitch = 0.05;
      headTiltZ = T.steer * -0.08;
      lx = -1.1 + sh * 0.45 + Math.sin(t * 9) * 0.01;
      lz = 0.3 + sh * 0.35;
      rx = -1.1 - T.steer * 0.12;
      rz = -0.3;
      buzz = Math.sin(t * 40) * 0.004 * (0.3 + T.kmh / 200);
      bobAmp = 0.01;
      bobSpeed = 9;
    } else if (act === 'coffee') {
      // ร้านกาแฟ: ถือแก้วด้วยมือขวา จิบเป็นพัก ๆ (ยกแขนขึ้น เงยหน้าเล็กน้อย)
      sip = Math.pow(Math.max(0, Math.sin(t * 0.8)), 2);
      bodyYaw = Math.sin(t * 0.5) * 0.08;
      headPitch = -0.08 - sip * 0.18;
      lx = -0.4;
      lz = 0.1;
      rx = -0.95 - sip * 0.75;
      rz = -0.12;
    } else if (act === 'sofa') {
      bodyYaw = Math.sin(t * 0.4) * 0.12;
      headPitch = -0.1;
      lx = -0.35;
      rx = -0.35;
    }

    // ระหว่างเดิน: ไม่ส่ายตัว, แขนแกว่งสลับกับขา
    bodyYaw *= 1 - walk;
    lx = lx * (1 - walk) + -Math.sin(a.phase) * 0.55 * walk;
    rx = rx * (1 - walk) + Math.sin(a.phase) * 0.55 * walk;
    lz = lz * (1 - walk) + -0.1 * walk;
    rz = rz * (1 - walk) + 0.1 * walk;

    const b = body.current;
    const hop = pose === 'success' ? Math.abs(Math.sin(t * 4.5)) * 0.35 : 0;
    const stepBob = Math.abs(Math.sin(a.phase)) * 0.05 * walk;
    const targetY = BODY_Y - SIT_DROP * sit + stepBob + Math.sin(t * bobSpeed) * bobAmp + hop;
    b.position.y = damp(b.position.y, targetY, 14, dt);
    b.position.x = status === 'error' ? shakeX : buzz !== 0 ? buzz : damp(b.position.x, 0, 10, dt);
    b.rotation.x = damp(b.rotation.x, 0.09 * walk + lean * (1 - walk), 8, dt); // เอนตัวไปข้างหน้าตอนเดิน / ก้มเล็งพูล
    b.rotation.z = status === 'error' ? shakeRoll : damp(b.rotation.z, 0, 10, dt);
    b.rotation.y = pose === 'success' ? a.spin : damp(b.rotation.y, bodyYaw, 5, dt);

    head.current.rotation.z = damp(head.current.rotation.z, headTiltZ, 6, dt);
    head.current.rotation.x = damp(head.current.rotation.x, headPitch, 6, dt);
    head.current.rotation.y = damp(head.current.rotation.y, headYaw, 6, dt);

    // แขนตอนพิมพ์ต้องตอบสนองไว (λ สูง) ไม่งั้นการสั่นจะถูก damp จนเรียบ
    const armLambda = status === 'coding' || status === 'error' ? 30 : walk > 0.3 ? 14 : 7;
    if (leftArm.current && rightArm.current) {
      leftArm.current.rotation.x = damp(leftArm.current.rotation.x, lx, armLambda, dt);
      leftArm.current.rotation.z = damp(leftArm.current.rotation.z, lz, armLambda, dt);
      rightArm.current.rotation.x = damp(rightArm.current.rotation.x, rx, armLambda, dt);
      rightArm.current.rotation.z = damp(rightArm.current.rotation.z, rz, armLambda, dt);
    }

    // ขา: เดิน = แกว่งสลับข้างพร้อมงอเข่า, นั่ง = ต้นขาชี้ไปข้างหน้า ท่อนล่างตั้งฉากลงพื้น
    // (หน้าของ Agent อยู่ที่ +z → rotation.x ติดลบ = เหวี่ยงขาไปข้างหน้า)
    if (leftHip.current && rightHip.current && leftKnee.current && rightKnee.current) {
      const hipL = Math.sin(a.phase) * 0.62 * walk;
      const kneeL = Math.max(0, -Math.cos(a.phase)) * 0.95 * walk;
      const kneeR = Math.max(0, Math.cos(a.phase)) * 0.95 * walk;
      leftHip.current.rotation.x = lerp(hipL, -Math.PI / 2, sit);
      rightHip.current.rotation.x = lerp(-hipL, -Math.PI / 2, sit);
      leftKnee.current.rotation.x = lerp(kneeL, Math.PI / 2, sit);
      rightKnee.current.rotation.x = lerp(kneeR, Math.PI / 2, sit);
    }

    // ===== 6) อุปกรณ์ประกอบตามสถานะ =====
    if (halo.current) {
      halo.current.visible = status === 'thinking' && activity === 'planning';
      halo.current.rotation.z += dt * 9;
      halo.current.position.y = 0.58 + Math.sin(t * 3) * 0.03;
    }
    if (scanRing.current) {
      scanRing.current.visible = status === 'testing';
      scanRing.current.rotation.z += dt * 4;
      scanRing.current.position.y = Math.sin(t * 2.2) * 0.75; // วงแหวนเลื่อนขึ้นลงรอบตัว
    }
    if (keyboard.current) {
      keyboard.current.visible = status === 'coding' && sit < 0.5; // นั่งโต๊ะแล้วมีคีย์บอร์ดจริง
      const m = (keyboard.current.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = 0.22 + Math.sin(t * 12) * 0.06 + Math.random() * 0.04;
    }

    // แผงโฮโลแกรม: reading = เอกสารที่เส้นไฮไลต์ไล่ลงมา, running = เทอร์มินัลที่พิมพ์ทีละบรรทัด
    if (holo.current) {
      const showHolo = activity === 'reading' || activity === 'running';
      const k = damp(holo.current.scale.x, showHolo ? 1 : 0.001, 9, dt);
      holo.current.scale.setScalar(k);
      holo.current.visible = k > 0.02;
      if (showHolo) {
        holo.current.position.y = 0.42 + Math.sin(t * 1.8) * 0.03;
        holoColor.set(ACTIVITY_META[activity].color);
        holoMat.current?.color.copy(holoColor);
        holoBarMaterial.color.copy(holoColor);
        const cycle = (t * 1.6) % 7; // running: บรรทัดที่ i เริ่มโตเมื่อ cycle > i
        const cursor = Math.floor(t * 1.4) % HOLO_LINES.length; // reading: บรรทัดที่กำลังอ่าน
        holoBars.current.forEach((bar, i) => {
          if (!bar) return;
          const w =
            activity === 'running'
              ? HOLO_LINES[i] * THREE.MathUtils.clamp(cycle - i, 0, 1)
              : HOLO_LINES[i] * (i === cursor ? 1 : 0.8);
          bar.scale.set(Math.max(w, 0.001), i === cursor && activity === 'reading' ? 1.9 : 1, 1);
          bar.position.x = -0.3 + w / 2;
        });
      }
    }
    if (magnifier.current) magnifier.current.visible = activity === 'searching';
    if (cue.current) {
      cue.current.visible = act === 'pool';
      cue.current.position.z = 0.42 + cueSlide * 0.16;
    }
    if (gamepad.current) gamepad.current.visible = act === 'console';
    if (cup.current) {
      cup.current.visible = act === 'coffee';
      cup.current.position.set(0.3, -0.05 + sip * 0.3, 0.46 - sip * 0.12);
    }
    if (globe.current) {
      globe.current.visible = activity === 'web';
      globe.current.rotation.y += dt * 1.8;
      globe.current.position.y = 0.78 + Math.sin(t * 2) * 0.05;
    }
    if (pingRing.current && pingMat.current) {
      const delegating = activity === 'delegating';
      pingRing.current.visible = delegating;
      if (delegating) {
        const f = (t * 0.9) % 1; // วงสัญญาณขยายออกจากเสาอากาศ แล้วจางหาย
        pingRing.current.scale.setScalar(0.35 + f * 1.5);
        pingMat.current.opacity = (1 - f) * 0.9;
      }
    }

    // ไฟสถานะ: error กะพริบถี่, อื่น ๆ หายใจช้า ๆ
    const lightPower = status === 'error' ? (Math.sin(t * 26) > 0 ? 5 : 0.2) : 2.2 + Math.sin(t * 3) * 0.6;
    if (statusLightMat.current) statusLightMat.current.emissiveIntensity = lightPower;
    if (glowLight.current) glowLight.current.intensity = lightPower * 0.45;

    // ===== 7) Lip sync จาก AnalyserNode =====
    const level = getSpeakerLevel(sessionId);
    if (mouth.current && mouthMat.current) {
      mouth.current.scale.y = damp(mouth.current.scale.y, 0.35 + level * 2.8, 25, dt);
      mouth.current.scale.x = damp(mouth.current.scale.x, 1 - level * 0.2, 25, dt);
      mouthMat.current.emissiveIntensity = 0.5 + level * 6;
    }

    // ===== 8) กะพริบตา (เฉลี่ยทุก ~3.5 วิ แบบสุ่ม) + ตาสว่างวาบตามเสียง =====
    if (t > a.nextBlink) {
      a.blinkStart = t;
      a.nextBlink = t + 2.5 + Math.random() * 2;
    }
    const blinkPhase = (t - a.blinkStart) / 0.14;
    const blink = blinkPhase >= 0 && blinkPhase < 1 ? 0.1 + Math.abs(blinkPhase * 2 - 1) * 0.9 : 1;
    const mood = pose === 'success' ? 0.45 : status === 'error' ? 0.6 : 1; // ยิ้มตาหยี / ตาหรี่ / หลับตาพริ้ม
    const eyeScale = blink * mood * (1 + level * 0.3);
    if (eyeL.current && eyeR.current) {
      eyeL.current.scale.y = eyeScale;
      eyeR.current.scale.y = eyeScale;
    }
    eyeMaterial.emissiveIntensity = lerp(1.6, 4.5, level);
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(selectId ?? sessionId);
  };

  const metal = { color: '#e8ecf3', metalness: 0.35, roughness: 0.32 } as const;
  // ผ้า: ด้านกว่าโลหะของตัวหุ่น
  const cloth = { metalness: 0.05, roughness: 0.75 } as const;
  const antennaLift = HAT_LIFT[outfit.hat];

  return (
    <group
      ref={root}
      position={spawnPosition}
      scale={mini ? MINI_SCALE : 1}
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
            <meshStandardMaterial color={outfit.top} {...cloth} />
          </RoundedBox>
          <BodyWear outfit={outfit} />
          {/* เอว */}
          <mesh position={[0, -0.4, 0]}>
            <cylinderGeometry args={[0.3, 0.26, 0.08, 20]} />
            <meshStandardMaterial color="#1f2937" emissive={statusColor} emissiveIntensity={0.8} />
          </mesh>
          {/* ขา: สะโพก (hip) → ต้นขา → เข่า (knee) → น่อง → เท้า */}
          {([-1, 1] as const).map((side) => (
            <group key={side} ref={side < 0 ? leftHip : rightHip} position={[side * 0.2, -0.38, 0]}>
              <RoundedBox args={[0.17, 0.4, 0.17]} radius={0.07} position={[0, -0.18, 0]} castShadow>
                <meshStandardMaterial color={outfit.pants} {...cloth} />
              </RoundedBox>
              <group ref={side < 0 ? leftKnee : rightKnee} position={[0, -0.36, 0]}>
                <mesh>
                  <sphereGeometry args={[0.09, 14, 14]} />
                  <meshStandardMaterial color="#94a3b8" metalness={0.5} roughness={0.3} />
                </mesh>
                <RoundedBox args={[0.15, 0.4, 0.15]} radius={0.06} position={[0, -0.19, 0]} castShadow>
                  {outfit.shorts ? (
                    <meshStandardMaterial {...metal} />
                  ) : (
                    <meshStandardMaterial color={outfit.pants} {...cloth} />
                  )}
                </RoundedBox>
                <RoundedBox args={[0.2, 0.08, 0.32]} radius={0.03} position={[0, -0.4, 0.06]} castShadow>
                  <meshStandardMaterial color={outfit.shoes} metalness={0.2} roughness={0.55} />
                </RoundedBox>
              </group>
            </group>
          ))}
          <pointLight ref={glowLight} position={[0, 0.2, 0.6]} color={statusColor} distance={3} intensity={1.2} />

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
            <HeadWear outfit={outfit} />
            {/* เสาอากาศ + ไฟสถานะ (ยกขึ้นตามความสูงหมวก ให้ไฟโผล่พ้นหมวกเสมอ) */}
            <group position={[0, antennaLift, 0]}>
              <mesh position={[0, 0.45 - antennaLift / 2, 0]}>
                <cylinderGeometry args={[0.02, 0.02, 0.22 + antennaLift, 8]} />
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
          </group>

          {/* ---------- ไหล่ (anchor ของ CollabBeam) + แขน ---------- */}
          <group ref={leftShoulder} position={[-0.5, 0.28, 0]}>
            <group ref={leftArm}>
              <mesh>
                <sphereGeometry args={[0.11, 16, 16]} />
                <meshStandardMaterial color={accent} />
              </mesh>
              <RoundedBox args={[0.16, 0.5, 0.16]} radius={0.07} position={[0, -0.3, 0]}>
                <meshStandardMaterial color={outfit.sleeve} {...cloth} />
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
                <meshStandardMaterial color={outfit.sleeve} {...cloth} />
              </RoundedBox>
              <mesh position={[0, -0.6, 0]}>
                <sphereGeometry args={[0.1, 16, 16]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.3} />
              </mesh>
              {/* แว่นขยาย (searching): อยู่ปลายแขนขวา วงเลนส์หันไปทางที่แขนชี้ */}
              <group ref={magnifier} visible={false}>
                <mesh position={[0, -0.7, 0]}>
                  <cylinderGeometry args={[0.022, 0.022, 0.18, 8]} />
                  <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.3} />
                </mesh>
                <mesh position={[0, -0.92, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[0.17, 0.028, 10, 32]} />
                  <meshStandardMaterial color="#5eead4" emissive="#2dd4bf" emissiveIntensity={2.2} toneMapped={false} />
                </mesh>
                <mesh position={[0, -0.92, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <circleGeometry args={[0.16, 24]} />
                  <meshBasicMaterial color="#99f6e4" transparent opacity={0.25} side={THREE.DoubleSide} depthWrite={false} />
                </mesh>
              </group>
            </group>
          </group>

          {/* ---------- ไม้คิว (เล่นพูลในห้องพักผ่อน): ขยับไป-กลับตามจังหวะแทง ---------- */}
          <group ref={cue} position={[0.5, -0.3, 0.42]} rotation={[-0.28, 0, 0]} visible={false}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.012, 0.024, 1.5, 8]} />
              <meshStandardMaterial color="#d6a05c" roughness={0.5} />
            </mesh>
            <mesh position={[0, 0, 0.76]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.013, 0.013, 0.04, 8]} />
              <meshStandardMaterial color="#60a5fa" />
            </mesh>
          </group>

          {/* ---------- จอยเกม (เล่นคอนโซลในห้องพักผ่อน) ---------- */}
          <mesh ref={gamepad} position={[0, -0.12, 0.5]} rotation={[-0.5, 0, 0]} visible={false}>
            <boxGeometry args={[0.36, 0.07, 0.16]} />
            <meshStandardMaterial color="#1f2937" emissive="#a78bfa" emissiveIntensity={0.5} roughness={0.5} />
          </mesh>

          {/* ---------- แก้วกาแฟ (ร้านกาแฟ) ---------- */}
          <group ref={cup} position={[0.3, -0.05, 0.46]} visible={false}>
            <mesh>
              <cylinderGeometry args={[0.07, 0.055, 0.14, 14]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.5} />
            </mesh>
            <mesh position={[0, 0.062, 0]}>
              <cylinderGeometry args={[0.062, 0.062, 0.016, 14]} />
              <meshStandardMaterial color="#7c4a2a" roughness={0.4} />
            </mesh>
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

          {/* ---------- แผงโฮโลแกรมข้างตัว (reading = เอกสาร, running = เทอร์มินัล) ---------- */}
          <group ref={holo} position={[-1.0, 0.42, 0.35]} rotation={[0, 0.35, 0]} scale={0.001} visible={false}>
            <mesh>
              <planeGeometry args={[0.8, 0.6]} />
              <meshBasicMaterial
                ref={holoMat}
                color="#60a5fa"
                transparent
                opacity={0.16}
                side={THREE.DoubleSide}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            {HOLO_LINES.map((w, i) => (
              <mesh
                key={i}
                ref={(m) => {
                  holoBars.current[i] = m;
                }}
                position={[-0.3 + w / 2, 0.2 - i * 0.092, 0.005]}
                material={holoBarMaterial}
              >
                <planeGeometry args={[1, 0.04]} />
              </mesh>
            ))}
          </group>

          {/* ---------- ลูกโลก (web) ---------- */}
          <group ref={globe} position={[1.0, 0.78, 0.4]} visible={false}>
            <mesh>
              <sphereGeometry args={[0.26, 16, 12]} />
              <meshBasicMaterial color="#22d3ee" wireframe transparent opacity={0.8} />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.24, 16, 12]} />
              <meshBasicMaterial color="#0e7490" transparent opacity={0.35} depthWrite={false} />
            </mesh>
          </group>

          {/* ---------- วงสัญญาณเหนือเสาอากาศ (delegating) ---------- */}
          <mesh ref={pingRing} position={[0, 1.42, 0]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
            <torusGeometry args={[0.5, 0.02, 8, 48]} />
            <meshBasicMaterial ref={pingMat} color="#e879f9" transparent opacity={0.8} depthWrite={false} />
          </mesh>

          {/* ---------- วงแหวนสแกน (testing) ---------- */}
          <mesh ref={scanRing} rotation={[Math.PI / 2, 0, 0]} visible={false}>
            <torusGeometry args={[0.85, 0.018, 8, 64]} />
            <meshStandardMaterial color="#fdba74" emissive="#f97316" emissiveIntensity={3} toneMapped={false} />
          </mesh>
        </group>
      </group>

      {/* วงเลือก (ไม่หมุนตามตัว) */}
      {selected && !gone && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.75, 0.82, 48]} />
          <meshBasicMaterial color="#e2e8f0" transparent opacity={0.7} />
        </mesh>
      )}

      {pose === 'success' && <SuccessEffect />}

      {/* ---------- 3D HUD ---------- */}
      <Html
        position={[0, 3.05 + antennaLift * 0.6, 0]}
        center
        distanceFactor={9}
        zIndexRange={[20, 0]}
        style={{ pointerEvents: 'none', display: gone ? 'none' : undefined }}
      >
        {mini ? (
          /* ป้ายย่อของ sub-agent: ชนิด + งานที่ได้รับมอบหมาย */
          <div
            className="w-44 select-none rounded-lg border bg-slate-950/85 px-2.5 py-1.5 text-[11px] leading-snug text-slate-200 shadow-lg backdrop-blur"
            style={{ borderColor: '#e879f9', opacity: dimmed ? 0.25 : 1, transition: 'opacity 0.25s' }}
          >
            <div className="flex items-center gap-1.5 font-semibold text-fuchsia-300">
              <CornerDownRight size={11} className="shrink-0" />
              <span className="truncate">{subType || 'sub-agent'}</span>
              <span
                className="ml-auto h-2 w-2 shrink-0 rounded-full animate-pulse"
                style={{ background: statusColor }}
              />
            </div>
            {agent.task && <div className="mt-0.5 truncate text-slate-300">{agent.task}</div>}
          </div>
        ) : (
        <div
          className="w-60 select-none rounded-xl border bg-slate-950/85 px-3 py-2 text-[11px] leading-snug text-slate-200 shadow-xl backdrop-blur"
          style={{
            borderColor: statusColor,
            boxShadow: `0 0 18px ${statusColor}55`,
            opacity: dimmed ? 0.25 : 1,
            transition: 'opacity 0.25s',
          }}
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
          {/* section: ตอนนี้ทำงานอยู่ในส่วนไหนของห้อง + กำลังทำอะไร (มาจาก tool ใน hook) */}
          <div
            className="mt-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-1 font-medium"
            style={{ background: `${activityMeta.color}22`, color: activityMeta.color }}
          >
            <MapPin size={11} className="shrink-0" />
            <span className="truncate">{activityMeta.section}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-slate-200">
              <ActivityIcon size={11} />
              {activityMeta.label}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-slate-300">
            <User size={11} style={{ color: accent }} />
            <span className="truncate">{agent.author}</span>
          </div>
          {agent.file && (
            <div className="mt-0.5 flex items-center gap-1.5 text-slate-400">
              <FileCode2 size={11} />
              <span className="truncate font-mono text-[10px]">
                {agent.tool && <span className="text-slate-500">{agent.tool} · </span>}
                {agent.file}
              </span>
            </div>
          )}
          {agent.subAgents.length > 0 && (
            <div className="mt-1 flex items-center gap-1.5 rounded-md bg-fuchsia-500/15 px-1.5 py-0.5 text-fuchsia-300">
              <Bot size={11} className="shrink-0" />
              <span className="truncate">
                sub-agent ×{agent.subAgents.length} · {agent.subAgents.map((s) => s.type).join(', ')}
              </span>
            </div>
          )}
        </div>
        )}
      </Html>
    </group>
  );
}

export default memo(Agent3D);
