import { WORKING_STATUSES, type AgentState } from '../types';
import { DESKS, MEETING_SPOTS, overflowSpot, type Pose, type Vec3 } from './office';

export type { Pose, Vec3 };

export interface Placement {
  /** ตำแหน่งเป้าหมายที่ Agent จะเดินไปหา */
  position: Vec3;
  /** จุดที่ต้องหันหน้าไปมอง (null = หันเข้าหากล้อง) */
  lookAt: Vec3 | null;
  /** คีย์ของกลุ่มที่กำลังร่วมงาน (null = ทำงานเดี่ยว) */
  groupKey: string | null;
  /** ท่าเมื่อถึงที่หมาย: นั่งเก้าอี้ หรือยืน */
  pose: Pose;
  /** true = ว่างอยู่ → เดินเล่นไปจุดต่าง ๆ ในห้องได้ */
  wander: boolean;
}

/**
 * กลุ่มร่วมงาน = Agent ≥ 2 ตัวที่อยู่ใน taskId เดียวกัน และกำลัง coding/testing พร้อมกัน
 * คืนค่า Map<taskId, sessionId[]> (เรียงตามลำดับที่เข้ามาในฉาก เพื่อให้ตำแหน่งคงที่)
 */
export function computeCollabGroups(agents: AgentState[]): Map<string, string[]> {
  const byTask = new Map<string, string[]>();
  for (const a of agents) {
    if (!WORKING_STATUSES.includes(a.status)) continue;
    const list = byTask.get(a.taskId) ?? [];
    list.push(a.sessionId);
    byTask.set(a.taskId, list);
  }
  for (const [key, ids] of byTask) if (ids.length < 2) byTask.delete(key);
  return byTask;
}

/** กลุ่มไหนใช้โต๊ะประชุมตัวไหน (เรียงตามชื่อกลุ่มให้คงที่) */
export function groupSpots(groups: Map<string, string[]>): Map<string, number> {
  const out = new Map<string, number>();
  [...groups.keys()].sort().forEach((key, gi) => out.set(key, gi % MEETING_SPOTS.length));
  return out;
}

/**
 * จัดโต๊ะให้ Agent: ตัวที่มีโต๊ะอยู่แล้วคงโต๊ะเดิม (ไม่ต้องเดินย้ายทุกครั้งที่มีตัวอื่นเข้า/ออก)
 * ตัวใหม่ได้โต๊ะว่างอันแรก; ถ้าโต๊ะเต็มจะไม่มีโต๊ะ (ไปยืนที่จุดสำรอง)
 */
export function assignDesks(agents: AgentState[], prev: Record<string, number>): Record<string, number> {
  const next: Record<string, number> = {};
  const used = new Set<number>();
  for (const a of agents) {
    const d = prev[a.sessionId];
    if (d !== undefined && !used.has(d)) {
      next[a.sessionId] = d;
      used.add(d);
    }
  }
  for (const a of agents) {
    if (next[a.sessionId] !== undefined) continue;
    const free = DESKS.findIndex((_, i) => !used.has(i));
    if (free >= 0) {
      next[a.sessionId] = free;
      used.add(free);
    }
  }
  return next;
}

/** ตารางเป้าหมายของ Agent ทุกตัว: โต๊ะทำงานตามสถานะ / โต๊ะประชุมเมื่อร่วมงานกัน */
export function computePlacements(
  agents: AgentState[],
  groups: Map<string, string[]>,
  deskOf: Record<string, number>,
): Record<string, Placement> {
  const result: Record<string, Placement> = {};
  let overflow = 0;

  for (const a of agents) {
    const desk = deskOf[a.sessionId] !== undefined ? DESKS[deskOf[a.sessionId]] : undefined;
    const faceCamera = (p: Vec3): Vec3 => [p[0], 0, p[2] + 10];
    const standAt: Vec3 = desk ? desk.stand : overflowSpot(overflow++);
    const seated = desk && (a.status === 'thinking' || a.status === 'coding' || a.status === 'testing' || a.status === 'error');

    if (seated) {
      result[a.sessionId] = { position: desk.seat, lookAt: faceCamera(desk.seat), groupKey: null, pose: 'sit', wander: false };
    } else {
      result[a.sessionId] = {
        position: standAt,
        lookAt: faceCamera(standAt),
        groupKey: null,
        pose: 'stand',
        wander: a.status === 'idle',
      };
    }
  }

  // ร่วมงาน: เดินไปล้อมโต๊ะประชุม หันเข้าหากัน
  const spots = groupSpots(groups);
  for (const [key, ids] of groups) {
    const center = MEETING_SPOTS[spots.get(key) ?? 0];
    const r = 0.95 + 0.22 * ids.length + 0.25; // เผื่อขอบโต๊ะ
    ids.forEach((id, k) => {
      // เริ่มที่มุมด้านข้าง เพื่อให้ 2 ตัวยืนซ้าย-ขวาหันหน้าเข้าหากัน (กล้องเห็นด้านข้างทั้งคู่)
      const ang = Math.PI + (k / ids.length) * Math.PI * 2;
      result[id] = {
        position: [center[0] + Math.cos(ang) * r, 0, center[2] + Math.sin(ang) * r],
        lookAt: center,
        groupKey: key,
        pose: 'stand',
        wander: false,
      };
    });
  }

  return result;
}
