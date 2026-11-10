import { WORKING_STATUSES, type AgentState } from '../types';

export type Vec3 = [number, number, number];

export interface Placement {
  /** ตำแหน่งเป้าหมายที่ Agent จะค่อย ๆ lerp เข้าไปหา */
  position: Vec3;
  /** จุดที่ต้องหันหน้าไปมอง (null = หันเข้าหากล้อง) */
  lookAt: Vec3 | null;
  /** คีย์ของกลุ่มที่กำลังร่วมงาน (null = ทำงานเดี่ยว) */
  groupKey: string | null;
}

const HOME_RADIUS = 5.2;

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

/**
 * ตำแหน่งบ้าน: วงแหวนรอบฉาก (ครึ่งวงด้านหลัง → ไม่บังกัน)
 * ตำแหน่งร่วมงาน: ล้อมวงรอบจุดศูนย์กลางของกลุ่ม แล้วหันเข้าหาจุดศูนย์กลาง
 */
export function computePlacements(agents: AgentState[], groups: Map<string, string[]>): Record<string, Placement> {
  const result: Record<string, Placement> = {};
  const n = agents.length;
  const slots = Math.max(n, 5);

  agents.forEach((a, i) => {
    // กระจายบนส่วนโค้งด้านหลัง จาก ~200° ถึง ~340° (มองจากกล้องที่อยู่ +z)
    const t = slots === 1 ? 0.5 : i / (slots - 1);
    const angle = Math.PI * (1.1 + 0.8 * t);
    result[a.sessionId] = {
      position: [Math.cos(angle) * HOME_RADIUS, 0, Math.sin(angle) * HOME_RADIUS * 0.6 - 0.5],
      lookAt: null,
      groupKey: null,
    };
  });

  const keys = [...groups.keys()].sort();
  keys.forEach((key, gi) => {
    const ids = groups.get(key)!;
    // ถ้ามีหลายกลุ่มพร้อมกัน แยกจุดรวมพลออกจากกันเล็กน้อย
    const spread = keys.length > 1 ? 2.6 : 0;
    const ga = (gi / keys.length) * Math.PI * 2;
    const center: Vec3 = [Math.cos(ga) * spread, 0, Math.sin(ga) * spread * 0.6 + 0.8];
    const r = 0.95 + 0.22 * ids.length;

    ids.forEach((id, k) => {
      // เริ่มที่มุมด้านข้าง เพื่อให้ 2 ตัวยืนซ้าย-ขวาหันหน้าเข้าหากัน (กล้องเห็นด้านข้างทั้งคู่)
      const a = Math.PI + (k / ids.length) * Math.PI * 2;
      result[id] = {
        position: [center[0] + Math.cos(a) * r, 0, center[2] + Math.sin(a) * r],
        lookAt: center,
        groupKey: key,
      };
    });
  });

  return result;
}
