import { authorColor, initialOf } from '../utils/people';

/** วงกลมอักษรตัวแรกของคนสั่งงาน (สีประจำตัว) */
export default function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-[#3d2f4f]"
      style={{ width: size, height: size, background: authorColor(name), fontSize: Math.round(size * 0.52) }}
    >
      {initialOf(name)}
    </span>
  );
}
