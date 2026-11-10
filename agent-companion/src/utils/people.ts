/** สีประจำตัวคนสั่งงาน — ชื่อที่รู้จักใช้สีจาก design, ชื่ออื่น hash → hue (คนเดียวกันได้สีเดียวกันเสมอ) */
const KNOWN_PEOPLE: Record<string, string> = {
  Nook: '#E8956A',
  Ploy: '#C9A2FF',
  Ton: '#6FD6EA',
  Mint: '#8BE09A',
  Bank: '#F2C14E',
};

export function authorColor(author: string): string {
  const known = KNOWN_PEOPLE[author];
  if (known) return known;
  let h = 0;
  for (let i = 0; i < author.length; i++) h = (h * 31 + author.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 70%, 65%)`;
}

export const initialOf = (name: string): string => name.trim().charAt(0).toUpperCase() || '?';

/** 754000 ms → "12:34" */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
