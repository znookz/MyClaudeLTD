/**
 * ชุดแต่งตัวของ Agent: แต่ละ session ได้ชุดไม่ซ้ำกัน (จนกว่าจะมีมากกว่าจำนวนชุด)
 * ชุดถูกผูกกับ sessionId ตลอดอายุ session → ตัวเดิมใส่ชุดเดิมเสมอ
 */
export type HatKind =
  | 'none'
  | 'cap'
  | 'hardhat'
  | 'chef'
  | 'straw'
  | 'cowboy'
  | 'wizard'
  | 'beret'
  | 'headband'
  | 'headphones'
  | 'tophat'
  | 'beanie';

export type ChestKind = 'plain' | 'tie' | 'bowtie' | 'zip' | 'buttons' | 'stripes' | 'vest' | 'dots' | 'emblem';

export type ExtraKind = 'glasses' | 'cape' | 'scarf' | 'hood' | 'backpack' | 'belt';

export interface Outfit {
  name: string;
  /** สีเสื้อ (ลำตัว) / แขนเสื้อ / กางเกง / รองเท้า */
  top: string;
  sleeve: string;
  pants: string;
  shoes: string;
  /** กางเกงขาสั้น: ท่อนขาล่างเป็นสีโลหะของหุ่น */
  shorts?: boolean;
  chest: ChestKind;
  chestColor: string;
  hat: HatKind;
  hatColor: string;
  extras: ExtraKind[];
  extraColor: string;
}

export const OUTFITS: Outfit[] = [
  { name: 'นักธุรกิจ', top: '#1e3a5f', sleeve: '#1e3a5f', pants: '#172a45', shoes: '#111827', chest: 'tie', chestColor: '#dc2626', hat: 'none', hatColor: '#000000', extras: ['glasses'], extraColor: '#0f172a' },
  { name: 'สายฮู้ด', top: '#7c3aed', sleeve: '#7c3aed', pants: '#374151', shoes: '#f8fafc', chest: 'zip', chestColor: '#ddd6fe', hat: 'headphones', hatColor: '#111827', extras: ['hood'], extraColor: '#6d28d9' },
  { name: 'วิศวกรไซต์งาน', top: '#f97316', sleeve: '#475569', pants: '#334155', shoes: '#78350f', chest: 'vest', chestColor: '#fef08a', hat: 'hardhat', hatColor: '#facc15', extras: ['belt'], extraColor: '#1f2937' },
  { name: 'นักวิทยาศาสตร์', top: '#f1f5f9', sleeve: '#f1f5f9', pants: '#0f766e', shoes: '#334155', chest: 'buttons', chestColor: '#0d9488', hat: 'none', hatColor: '#000000', extras: ['glasses'], extraColor: '#0f766e' },
  { name: 'นักกีฬา', top: '#dc2626', sleeve: '#e8ecf3', pants: '#f8fafc', shoes: '#2563eb', shorts: true, chest: 'stripes', chestColor: '#f8fafc', hat: 'headband', hatColor: '#f8fafc', extras: [], extraColor: '#000000' },
  { name: 'เชฟ', top: '#fafaf9', sleeve: '#fafaf9', pants: '#1f2937', shoes: '#111827', chest: 'buttons', chestColor: '#1f2937', hat: 'chef', hatColor: '#ffffff', extras: ['scarf'], extraColor: '#ef4444' },
  { name: 'สายเที่ยวทะเล', top: '#0ea5a4', sleeve: '#e8ecf3', pants: '#fde68a', shoes: '#92400e', shorts: true, chest: 'dots', chestColor: '#fb7185', hat: 'straw', hatColor: '#e7c98b', extras: [], extraColor: '#000000' },
  { name: 'ซูเปอร์ฮีโร่', top: '#2563eb', sleeve: '#2563eb', pants: '#1d4ed8', shoes: '#dc2626', chest: 'emblem', chestColor: '#facc15', hat: 'none', hatColor: '#000000', extras: ['cape', 'belt'], extraColor: '#dc2626' },
  { name: 'คาวบอย', top: '#92400e', sleeve: '#e7d3b0', pants: '#1e40af', shoes: '#451a03', chest: 'vest', chestColor: '#d6a05c', hat: 'cowboy', hatColor: '#7c4a1e', extras: ['scarf'], extraColor: '#dc2626' },
  { name: 'พ่อมด', top: '#4c1d95', sleeve: '#4c1d95', pants: '#3b1578', shoes: '#1e1b4b', chest: 'dots', chestColor: '#fde047', hat: 'wizard', hatColor: '#4c1d95', extras: ['cape'], extraColor: '#312e81' },
  { name: 'นินจา', top: '#1f2937', sleeve: '#1f2937', pants: '#111827', shoes: '#0b0f17', chest: 'plain', chestColor: '#000000', hat: 'headband', hatColor: '#dc2626', extras: ['belt', 'scarf'], extraColor: '#dc2626' },
  { name: 'ศิลปิน', top: '#f8fafc', sleeve: '#f8fafc', pants: '#111827', shoes: '#7f1d1d', chest: 'stripes', chestColor: '#111827', hat: 'beret', hatColor: '#b91c1c', extras: ['scarf'], extraColor: '#f59e0b' },
  { name: 'นักเรียนไปค่าย', top: '#16a34a', sleeve: '#e8ecf3', pants: '#a16207', shoes: '#422006', shorts: true, chest: 'plain', chestColor: '#000000', hat: 'cap', hatColor: '#15803d', extras: ['backpack'], extraColor: '#ea580c' },
  { name: 'สุภาพบุรุษ', top: '#111827', sleeve: '#111827', pants: '#111827', shoes: '#000000', chest: 'bowtie', chestColor: '#be123c', hat: 'tophat', hatColor: '#111827', extras: [], extraColor: '#000000' },
  { name: 'สายหนาว', top: '#0369a1', sleeve: '#0369a1', pants: '#1e293b', shoes: '#f1f5f9', chest: 'zip', chestColor: '#bae6fd', hat: 'beanie', hatColor: '#f43f5e', extras: ['scarf'], extraColor: '#fbbf24' },
];

/** ไฟสถานะบนเสาอากาศต้องโผล่พ้นหมวกเสมอ → ยกเสาอากาศขึ้นตามความสูงหมวก */
export const HAT_LIFT: Record<HatKind, number> = {
  none: 0,
  cap: 0.08,
  hardhat: 0.18,
  chef: 0.5,
  straw: 0.14,
  cowboy: 0.24,
  wizard: 0.62,
  beret: 0.06,
  headband: 0,
  headphones: 0.12,
  tophat: 0.42,
  beanie: 0.3,
};

function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * จัดชุดให้ทุก session: ตัวที่มีชุดแล้วคงชุดเดิม; ตัวใหม่เริ่มจากชุดตาม hash ของ sessionId
 * แล้วเลื่อนไปชุดถัดไปจนกว่าจะเจอชุดที่ยังไม่มีใครใส่ (ถ้าเต็มทุกชุดแล้วจึงยอมซ้ำ)
 */
export function assignOutfits(ids: string[], prev: Record<string, number>): Record<string, number> {
  const next: Record<string, number> = {};
  const used = new Set<number>();
  for (const id of ids) {
    const o = prev[id];
    if (o !== undefined) {
      next[id] = o;
      used.add(o);
    }
  }
  for (const id of ids) {
    if (next[id] !== undefined) continue;
    const start = hash(id) % OUTFITS.length;
    let pick = start;
    for (let k = 0; k < OUTFITS.length; k++) {
      const c = (start + k) % OUTFITS.length;
      if (!used.has(c)) {
        pick = c;
        break;
      }
    }
    next[id] = pick;
    used.add(pick);
  }
  return next;
}
