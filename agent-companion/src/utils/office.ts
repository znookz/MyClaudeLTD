/**
 * ข้อมูลของห้อง office: ขนาดห้อง โต๊ะทำงาน จุดประชุม จุดที่ Agent ไปเดินเล่น
 * และ pathfinding (A* บน grid) เพื่อให้ Agent เดินอ้อมเฟอร์นิเจอร์ได้
 *
 * แกน: x = ซ้าย→ขวา, z = ไกลกล้อง→ใกล้กล้อง (กล้องอยู่ +z), y = สูง
 * Agent หันหน้าไปทาง +z ของตัวเอง (หน้า visor อยู่ที่ +z)
 */
export type Vec3 = [number, number, number];
export type Pose = 'sit' | 'stand';

export const ROOM = { minX: -8.5, maxX: 8.5, minZ: -6.5, maxZ: 5.5, wallH: 3.6 } as const;

/** ห้องพักผ่อน: อยู่ทางซ้ายของห้องทำงาน ใช้ผนังกั้นร่วมกันที่ x = ROOM.minX */
export const LOUNGE = { minX: -16.5, maxX: ROOM.minX, minZ: ROOM.minZ, maxZ: ROOM.maxZ } as const;

/** ช่องประตูในผนังกั้นระหว่างห้องทำงาน ↔ ห้องพักผ่อน */
export const LOUNGE_DOOR = { z0: 3.1, z1: 4.9 } as const;

/** ตำแหน่งเฟอร์นิเจอร์ในห้องพักผ่อน (ใช้ร่วมกันทั้งตอนวาดฉากและตอนคำนวณเส้นทาง) */
export const LOUNGE_ITEMS = {
  pool: { x: -12.6, z: 1.4, w: 2.8, d: 1.6 },
  arcades: [-15.1, -13.9].map((x) => ({ x, z: -5.95 })),
  tv: { x: -10.8, z: -6.15 },
  tvSofa: { x: -10.8, z: -3.4 },
  wallSofa: { x: -15.85, z: 3.9 },
  lowTable: { x: -14.4, z: 3.9 },
  massage: [-2.4, -0.6].map((z) => ({ x: -15.7, z })),
};

/** ประตูอยู่ที่ผนังขวา: Agent ใหม่จะเดินเข้ามาจากตรงนี้ */
export const DOOR = { z: 3.9, spawn: [7.9, 0, 3.9] as Vec3 };

// ---------------- โต๊ะทำงาน ----------------
export interface Desk {
  x: number;
  z: number;
  /** ตำแหน่งเก้าอี้ (Agent นั่งหันหน้า +z ไปทางโต๊ะที่อยู่ข้างหน้า) */
  seat: Vec3;
  /** ตำแหน่งยืนข้างหลังเก้าอี้ (ตอนลุกขึ้นฉลอง / ยืนรอ) */
  stand: Vec3;
}

const mkDesk = (x: number, z: number): Desk => ({
  x,
  z,
  seat: [x, 0, z - 0.75],
  stand: [x, 0, z - 1.65],
});

const ROW_A_Z = -3.7;
const ROW_B_Z = -0.5;
const ROW_A = [-7, -3.5, 0, 3.5, 7].map((x) => mkDesk(x, ROW_A_Z));
const ROW_B = [-5.25, -1.75, 1.75, 5.25].map((x) => mkDesk(x, ROW_B_Z));

/** เรียงจากกลางออกข้างนอก: ตัวแรก ๆ จะได้โต๊ะที่มองเห็นชัด */
export const DESKS: Desk[] = [ROW_A[2], ROW_B[1], ROW_B[2], ROW_A[1], ROW_A[3], ROW_B[0], ROW_B[3], ROW_A[0], ROW_A[4]];

/** จุดยืนสำรองสำหรับ Agent ที่เกินจำนวนโต๊ะ */
export function overflowSpot(i: number): Vec3 {
  const col = i % 8;
  const row = Math.floor(i / 8);
  return [-5.6 + col * 1.6, 0, 4.7 - row * 1.1];
}

// ---------------- จุดประชุม ----------------
export const MEETING_SPOTS: Vec3[] = [
  [0, 0, 2.4],
  [-3.6, 0, 2.4],
  [3.6, 0, 2.4],
];
export const MEETING_TABLE_R = 0.78;

// ---------------- จุดที่ Agent ที่ว่างอยู่จะเดินไปเล่น ----------------
/** กิจกรรมพิเศษที่จุดนั้น → Agent3D ใช้เลือกท่าทาง */
export type PoiAct = 'arcade' | 'pool' | 'console' | 'massage' | 'sofa';

export interface Poi {
  name: string;
  stand: Vec3;
  lookAt: Vec3;
  pose: Pose;
  /** จุดในห้องพักผ่อนถูกสุ่มเลือกบ่อยกว่า และอยู่นานกว่า */
  lounge?: boolean;
  act?: PoiAct;
}

const { pool, arcades, tvSofa, wallSofa, massage } = LOUNGE_ITEMS;

export const POIS: Poi[] = [
  { name: 'ชั้นหนังสือ', stand: [-7.3, 0, -1.4], lookAt: [-9, 0, -1.4], pose: 'stand' },
  { name: 'เครื่องชงกาแฟ', stand: [-7.3, 0, 0.4], lookAt: [-9, 0, 0.4], pose: 'stand' },
  { name: 'ตู้ขนม', stand: [-7.3, 0, 1.5], lookAt: [-9, 0, 1.5], pose: 'stand' },
  { name: 'ตู้น้ำ', stand: [-7.3, 0, 2.45], lookAt: [-9, 0, 2.45], pose: 'stand' },
  { name: 'ไวต์บอร์ด', stand: [7.5, 0, -1.5], lookAt: [9, 0, -1.5], pose: 'stand' },
  { name: 'เครื่องปริ้นท์', stand: [7.5, 0, 0.9], lookAt: [9, 0, 0.9], pose: 'stand' },
  // ---------- ห้องพักผ่อน ----------
  ...arcades.map(
    (a, i): Poi => ({
      name: `ตู้เกม ${i + 1}`,
      stand: [a.x, 0, -5.0],
      lookAt: [a.x, 0, -9],
      pose: 'stand',
      lounge: true,
      act: 'arcade',
    }),
  ),
  ...[-0.55, 0.55].map(
    (dx, i): Poi => ({
      name: `เกมคอนโซล ${i + 1}`,
      stand: [tvSofa.x + dx, 0, tvSofa.z],
      lookAt: [tvSofa.x + dx, 0, -9],
      pose: 'sit',
      lounge: true,
      act: 'console',
    }),
  ),
  { name: 'โต๊ะพูล (หน้า)', stand: [pool.x - 0.5, 0, pool.z + 1.4], lookAt: [pool.x - 0.5, 0, pool.z], pose: 'stand', lounge: true, act: 'pool' },
  { name: 'โต๊ะพูล (หลัง)', stand: [pool.x + 0.5, 0, pool.z - 1.4], lookAt: [pool.x + 0.5, 0, pool.z], pose: 'stand', lounge: true, act: 'pool' },
  { name: 'โต๊ะพูล (ซ้าย)', stand: [pool.x - 2.0, 0, pool.z], lookAt: [pool.x, 0, pool.z], pose: 'stand', lounge: true, act: 'pool' },
  ...massage.map(
    (m, i): Poi => ({
      name: `เก้าอี้นวด ${i + 1}`,
      stand: [m.x, 0, m.z],
      lookAt: [0, 0, m.z],
      pose: 'sit',
      lounge: true,
      act: 'massage',
    }),
  ),
  ...[-0.55, 0.55].map(
    (dz, i): Poi => ({
      name: `โซฟา ${i + 1}`,
      stand: [wallSofa.x, 0, wallSofa.z + dz],
      lookAt: [0, 0, wallSofa.z + dz],
      pose: 'sit',
      lounge: true,
      act: 'sofa',
    }),
  ),
];

const poiClaims = new Map<number, string>();

/** จองจุดว่างอันใดอันหนึ่ง (สุ่ม) คืน index หรือ -1 ถ้าเต็ม */
export function claimPoi(sessionId: string): number {
  const free = POIS.map((_, i) => i).filter((i) => !poiClaims.has(i));
  if (free.length === 0) return -1;
  // ถ่วงน้ำหนัก: ว่างแล้วส่วนใหญ่จะไปห้องพักผ่อน
  const weight = (i: number) => (POIS[i].lounge ? 3 : 1);
  let roll = Math.random() * free.reduce((n, i) => n + weight(i), 0);
  let idx = free[free.length - 1];
  for (const i of free) {
    roll -= weight(i);
    if (roll <= 0) {
      idx = i;
      break;
    }
  }
  poiClaims.set(idx, sessionId);
  return idx;
}

export function releasePoi(sessionId: string) {
  for (const [idx, owner] of poiClaims) if (owner === sessionId) poiClaims.delete(idx);
}

// ---------------- สิ่งกีดขวาง (ใช้คำนวณเส้นทาง) ----------------
type Rect = { x0: number; z0: number; x1: number; z1: number };
type Circle = { x: number; z: number; r: number };

const rects: Rect[] = [
  ...DESKS.map((d) => ({ x0: d.x - 0.75, z0: d.z - 0.36, x1: d.x + 0.75, z1: d.z + 0.36 })),
  { x0: -8.5, z0: -2.2, x1: -8.0, z1: -0.6 }, // ชั้นหนังสือ
  { x0: -8.5, z0: -0.1, x1: -7.9, z1: 2.0 }, // เคาน์เตอร์กาแฟ
  { x0: 8.0, z0: 0.2, x1: 8.5, z1: 1.6 }, // ตู้เครื่องปริ้นท์
  // ผนังกั้นห้องทำงาน ↔ ห้องพักผ่อน (เว้นช่องประตู)
  { x0: ROOM.minX - 0.1, z0: ROOM.minZ, x1: ROOM.minX + 0.1, z1: LOUNGE_DOOR.z0 },
  { x0: ROOM.minX - 0.1, z0: LOUNGE_DOOR.z1, x1: ROOM.minX + 0.1, z1: ROOM.maxZ },
  // ---------- ห้องพักผ่อน ----------
  { x0: pool.x - pool.w / 2, z0: pool.z - pool.d / 2, x1: pool.x + pool.w / 2, z1: pool.z + pool.d / 2 }, // โต๊ะพูล
  { x0: -15.6, z0: -6.5, x1: -13.4, z1: -5.45 }, // ตู้เกม
  { x0: -11.9, z0: -6.5, x1: -9.7, z1: -5.9 }, // ชั้นวางทีวี
  // โซฟา/เก้าอี้นวด: กันเฉพาะพนักพิง เพื่อให้เดินเข้าไปนั่งจากด้านหน้าเสมอ
  { x0: tvSofa.x - 1.3, z0: tvSofa.z + 0.25, x1: tvSofa.x + 1.3, z1: tvSofa.z + 0.6 },
  { x0: -16.5, z0: wallSofa.z - 1.3, x1: -16.1, z1: wallSofa.z + 1.3 },
  { x0: -14.8, z0: 3.4, x1: -14.0, z1: 4.4 }, // โต๊ะเตี้ยหน้าโซฟา
  { x0: -16.5, z0: -3.0, x1: -16.0, z1: 0.0 }, // เก้าอี้นวด
];
const circles: Circle[] = [
  ...MEETING_SPOTS.map((s) => ({ x: s[0], z: s[2], r: MEETING_TABLE_R })),
  { x: -8.0, z: 2.45, r: 0.3 }, // ตู้น้ำ
  { x: -7.9, z: -5.9, r: 0.35 }, // ต้นไม้
  { x: 8.0, z: -5.9, r: 0.35 },
  { x: 8.0, z: 5.0, r: 0.35 },
  { x: -3.6, z: 4.9, r: 0.35 },
  { x: -9.1, z: -5.9, r: 0.35 }, // ต้นไม้ในห้องพักผ่อน
  { x: -16.0, z: 1.3, r: 0.35 },
  { x: -9.2, z: 0.6, r: 0.35 },
];
export const PLANTS: Circle[] = circles.slice(MEETING_SPOTS.length + 1);

const INFLATE = 0.4; // รัศมี Agent โดยประมาณ

function hitsObstacle(x: number, z: number): boolean {
  for (const r of rects) {
    if (x > r.x0 - INFLATE && x < r.x1 + INFLATE && z > r.z0 - INFLATE && z < r.z1 + INFLATE) return true;
  }
  for (const c of circles) {
    if (Math.hypot(x - c.x, z - c.z) < c.r + INFLATE) return true;
  }
  return false;
}

// ---------------- grid + A* ----------------
const CELL = 0.25;
const GX0 = -16.1;
const GZ0 = -6.0;
const NX = Math.round((8.1 - GX0) / CELL) + 1;
const NZ = Math.round((5.1 - GZ0) / CELL) + 1;
const blocked = new Uint8Array(NX * NZ);
for (let iz = 0; iz < NZ; iz++) {
  for (let ix = 0; ix < NX; ix++) {
    blocked[iz * NX + ix] = hitsObstacle(GX0 + ix * CELL, GZ0 + iz * CELL) ? 1 : 0;
  }
}

const cellX = (ix: number) => GX0 + ix * CELL;
const cellZ = (iz: number) => GZ0 + iz * CELL;
const toCell = (v: number, o: number, n: number) => Math.min(n - 1, Math.max(0, Math.round((v - o) / CELL)));

/** เส้นตรงระหว่าง a→b ไม่ชนอะไร (ช่วงใกล้ปลายทั้งสองข้างยกเว้น เพราะเริ่ม/จบในที่นั่งซึ่งอยู่ใกล้โต๊ะ) */
function lineClear(ax: number, az: number, bx: number, bz: number, exA = true, exB = true): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(len / 0.1));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    if ((exA && Math.hypot(x - ax, z - az) < 0.6) || (exB && Math.hypot(x - bx, z - bz) < 0.6)) continue;
    if (hitsObstacle(x, z)) return false;
  }
  return true;
}

function nearestFreeCell(ix: number, iz: number): [number, number] {
  if (!blocked[iz * NX + ix]) return [ix, iz];
  for (let rad = 1; rad < 12; rad++) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let dz = -rad; dz <= rad; dz++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== rad) continue;
        const x = ix + dx;
        const z = iz + dz;
        if (x < 0 || z < 0 || x >= NX || z >= NZ || blocked[z * NX + x]) continue;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = [x, z];
        }
      }
    }
    if (best) return best;
  }
  return [ix, iz];
}

/** min-heap เล็ก ๆ สำหรับ A* */
class Heap {
  private a: { k: number; f: number }[] = [];
  get size() {
    return this.a.length;
  }
  push(k: number, f: number) {
    const a = this.a;
    a.push({ k, f });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top.k;
  }
}

const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * หาเส้นทางเดินจาก from → to คืนรายการจุด (x,0,z) ที่ต้องเดินผ่านตามลำดับ (รวมจุดปลายทางจริง)
 * ถ้าหาไม่เจอจะเดินตรงไปเลย (ดีกว่าค้างอยู่กับที่)
 */
export function findPath(from: Vec3, to: Vec3): Vec3[] {
  const goal: Vec3 = [to[0], 0, to[2]];
  if (lineClear(from[0], from[2], to[0], to[2])) return [goal];

  const sx = toCell(from[0], GX0, NX);
  const sz = toCell(from[2], GZ0, NZ);
  const [gx, gz] = nearestFreeCell(toCell(to[0], GX0, NX), toCell(to[2], GZ0, NZ));
  const startIdx = sz * NX + sx;
  const goalIdx = gz * NX + gx;

  // เซลล์รอบจุดเริ่ม (เช่น กำลังนั่งอยู่ติดโต๊ะ) ให้เดินออกได้
  const escape = (ix: number, iz: number) => Math.hypot(cellX(ix) - from[0], cellZ(iz) - from[2]) < 0.6;

  const g = new Float32Array(NX * NZ).fill(Infinity);
  const prev = new Int32Array(NX * NZ).fill(-1);
  const closed = new Uint8Array(NX * NZ);
  const open = new Heap();
  g[startIdx] = 0;
  open.push(startIdx, 0);

  let found = false;
  while (open.size) {
    const cur = open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goalIdx) {
      found = true;
      break;
    }
    const cx = cur % NX;
    const cz = (cur - cx) / NX;
    for (const [dx, dz, cost] of DIRS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= NX || nz >= NZ) continue;
      const ni = nz * NX + nx;
      if (closed[ni] || (blocked[ni] && !escape(nx, nz))) continue;
      // ห้ามตัดมุมสิ่งกีดขวาง
      if (dx !== 0 && dz !== 0 && (blocked[cz * NX + nx] || blocked[nz * NX + cx])) continue;
      const ng = g[cur] + cost;
      if (ng < g[ni]) {
        g[ni] = ng;
        prev[ni] = cur;
        open.push(ni, ng + Math.hypot(nx - gx, nz - gz));
      }
    }
  }
  if (!found) return [goal];

  const cells: [number, number][] = [];
  for (let i = goalIdx; i !== -1; i = prev[i]) {
    const ix = i % NX;
    cells.push([cellX(ix), cellZ((i - ix) / NX)]);
  }
  cells.reverse();

  // string-pulling: ข้ามจุดกลางทางที่ไม่จำเป็น ให้เดินเป็นเส้นตรงยาว ๆ
  const pts: [number, number][] = [[from[0], from[2]], ...cells.slice(1), [to[0], to[2]]];
  const out: Vec3[] = [];
  let anchor = 0;
  while (anchor < pts.length - 1) {
    let next = pts.length - 1;
    while (
      next > anchor + 1 &&
      !lineClear(pts[anchor][0], pts[anchor][1], pts[next][0], pts[next][1], anchor === 0, next === pts.length - 1)
    )
      next--;
    out.push([pts[next][0], 0, pts[next][1]]);
    anchor = next;
  }
  return out;
}
