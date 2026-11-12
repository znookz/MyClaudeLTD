/**
 * physics ของลูกพูลบนโต๊ะในห้องพักผ่อน (2 มิติบนผิวโต๊ะ, พิกัด local ของโต๊ะ: x = ยาว, z = กว้าง)
 * - มีคนยืนเล่นที่โต๊ะ → ลูกขาวถูกแทงไปหาลูกเป้าทุกครั้งที่ลูกหยุดนิ่ง
 * - ชนกันแบบยืดหยุ่น (มวลเท่ากัน), เด้งขอบโต๊ะ, ความฝืดผ้า, ตกหลุมได้
 * - ลูกเป้าเหลือ ≤ 2 ลูก → ตั้งลูกใหม่ (rack)
 * แยกเป็นฟังก์ชันล้วนไม่พึ่ง three.js เพื่อให้ทดสอบได้ง่าย
 */
export const POOL_W = 2.6;
export const POOL_D = 1.4;
export const BALL_R = 0.045;
const POCKET_R = 0.085;
const CUSHION = 0.8; // สัดส่วนความเร็วที่เหลือหลังเด้งขอบ
const RESTITUTION = 0.95; // ความยืดหยุ่นตอนลูกชนกัน
const FRICTION = 0.9; // ยิ่งมากยิ่งหยุดเร็ว
const STOP_SPEED = 0.03;
const SUBSTEPS = 3;

export const POCKETS: [number, number][] = [-1, 0, 1].flatMap((ix) =>
  [-1, 1].map((iz): [number, number] => [ix * (POOL_W / 2 - 0.04), iz * (POOL_D / 2 - 0.04)]),
);

/** สีลูก: index 0 = ลูกขาว */
export const BALL_COLORS = ['#f8fafc', '#facc15', '#2563eb', '#dc2626', '#7c3aed', '#f97316', '#16a34a', '#be123c', '#111827'];

const CUE_SPOT: [number, number] = [-0.75, 0];

/** ลูกเป้า 8 ลูกเรียงเป็นสามเหลี่ยม 1-2-3-2 */
function rackSpots(): [number, number][] {
  const dx = BALL_R * 2 * 0.88;
  const dz = BALL_R * 2 * 1.02;
  const rows = [1, 2, 3, 2];
  const out: [number, number][] = [];
  rows.forEach((n, r) => {
    for (let k = 0; k < n; k++) out.push([0.4 + r * dx, (k - (n - 1) / 2) * dz]);
  });
  return out;
}

export interface Ball {
  x: number;
  z: number;
  vx: number;
  vz: number;
  sunk: boolean;
  /** 0..1 แอนิเมชันจมลงหลุม */
  sink: number;
}

export interface PoolState {
  balls: Ball[];
  /** เวลาที่จะแทงครั้งถัดไป (วินาที ตามนาฬิกาของฉาก) */
  nextShot: number;
  /** เวลาที่จะตั้งลูกใหม่ (0 = ยังไม่ต้อง) */
  rackAt: number;
  shots: number;
}

const ball = (x: number, z: number): Ball => ({ x, z, vx: 0, vz: 0, sunk: false, sink: 0 });

export function newRack(): Ball[] {
  return [ball(...CUE_SPOT), ...rackSpots().map(([x, z]) => ball(x, z))];
}

export function createPool(): PoolState {
  return { balls: newRack(), nextShot: 0, rackAt: 0, shots: 0 };
}

export const isMoving = (s: PoolState) => s.balls.some((b) => !b.sunk && (b.vx !== 0 || b.vz !== 0));

/** วางลูกขาวที่ตกหลุมกลับบนโต๊ะ ตรงจุดที่ไม่ทับลูกอื่น */
function respawnCue(s: PoolState) {
  const cue = s.balls[0];
  for (let k = 0; k < 12; k++) {
    const x = CUE_SPOT[0] - (k % 3) * 0.12;
    const z = (Math.floor(k / 3) % 2 ? -1 : 1) * Math.floor(k / 3) * 0.12;
    const free = s.balls.every((b, i) => i === 0 || b.sunk || Math.hypot(b.x - x, b.z - z) > BALL_R * 2.2);
    if (free) {
      Object.assign(cue, ball(x, z));
      return;
    }
  }
  Object.assign(cue, ball(...CUE_SPOT));
}

function shoot(s: PoolState, t: number, rand: () => number) {
  if (s.balls[0].sunk) respawnCue(s);
  const cue = s.balls[0];
  const targets = s.balls.filter((b, i) => i > 0 && !b.sunk);
  if (targets.length === 0) return;
  const target = targets[Math.floor(rand() * targets.length)];
  const ang = Math.atan2(target.z - cue.z, target.x - cue.x) + (rand() - 0.5) * 0.12; // เล็งพลาดนิดหน่อย
  const speed = 1.6 + rand() * 1.3;
  cue.vx = Math.cos(ang) * speed;
  cue.vz = Math.sin(ang) * speed;
  s.shots++;
  s.nextShot = t + 2 + rand() * 2;
}

function integrate(s: PoolState, h: number) {
  const limX = POOL_W / 2 - BALL_R;
  const limZ = POOL_D / 2 - BALL_R;
  const live = s.balls.filter((b) => !b.sunk);

  for (const b of live) {
    b.x += b.vx * h;
    b.z += b.vz * h;
    // ตกหลุม
    if (POCKETS.some(([px, pz]) => Math.hypot(b.x - px, b.z - pz) < POCKET_R)) {
      b.sunk = true;
      b.vx = b.vz = 0;
      continue;
    }
    // เด้งขอบโต๊ะ
    if (b.x > limX) {
      b.x = limX;
      b.vx = -Math.abs(b.vx) * CUSHION;
    } else if (b.x < -limX) {
      b.x = -limX;
      b.vx = Math.abs(b.vx) * CUSHION;
    }
    if (b.z > limZ) {
      b.z = limZ;
      b.vz = -Math.abs(b.vz) * CUSHION;
    } else if (b.z < -limZ) {
      b.z = -limZ;
      b.vz = Math.abs(b.vz) * CUSHION;
    }
  }

  // ชนกัน (มวลเท่ากัน): แยกลูกที่ซ้อนกันออก แล้วแลกความเร็วตามแนวเส้นที่ลากผ่านจุดศูนย์กลาง
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (a.sunk || b.sunk) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d >= BALL_R * 2 || d < 1e-6) continue;
      const nx = dx / d;
      const nz = dz / d;
      const push = (BALL_R * 2 - d) / 2;
      a.x -= nx * push;
      a.z -= nz * push;
      b.x += nx * push;
      b.z += nz * push;
      const vn = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (vn <= 0) continue; // กำลังแยกออกจากกันอยู่แล้ว
      const k = vn * (1 + RESTITUTION) * 0.5;
      a.vx -= k * nx;
      a.vz -= k * nz;
      b.vx += k * nx;
      b.vz += k * nz;
    }
  }
}

/**
 * เดินเวลา dt วินาที — คืน true ถ้าเพิ่งตั้งลูกใหม่ (ให้ฝั่งวาดรีเซ็ตการหมุนของลูก)
 * active = มีหุ่นยืนเล่นอยู่ที่โต๊ะ
 */
export function stepPool(s: PoolState, dt: number, t: number, active: boolean, rand: () => number = Math.random): boolean {
  // ไม่มีคนเล่น: เลื่อนเวลาแทงออกไปเรื่อย ๆ → คนเพิ่งมาถึงจะแทงหลังจากเล็งสักพัก
  if (!active) s.nextShot = Math.max(s.nextShot, t + 1.2);

  if (s.rackAt > 0 && t >= s.rackAt) {
    s.balls = newRack();
    s.rackAt = 0;
    s.nextShot = t + 1.5;
    return true;
  }
  if (active && s.rackAt === 0 && t >= s.nextShot && !isMoving(s)) shoot(s, t, rand);

  const h = dt / SUBSTEPS;
  for (let k = 0; k < SUBSTEPS; k++) integrate(s, h);

  const decay = Math.exp(-FRICTION * dt);
  for (const b of s.balls) {
    if (b.sunk) {
      b.sink = Math.min(1, b.sink + dt * 3);
      continue;
    }
    b.vx *= decay;
    b.vz *= decay;
    if (Math.hypot(b.vx, b.vz) < STOP_SPEED) b.vx = b.vz = 0;
  }

  // ลูกเป้าเหลือน้อยแล้ว และทุกลูกหยุดนิ่ง → ตั้งลูกใหม่ในอีก 2 วิ
  const left = s.balls.filter((b, i) => i > 0 && !b.sunk).length;
  if (s.rackAt === 0 && left <= 2 && !isMoving(s)) s.rackAt = t + 2;
  return false;
}
