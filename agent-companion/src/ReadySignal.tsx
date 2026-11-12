import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

/** บอกว่าฉากวาดเฟรมจริงแล้ว (หลังคอมไพล์ shader/อัปโหลด texture เสร็จ) → ซ่อนหน้าจอโหลด */
export default function ReadySignal({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    if (++frames.current >= 6) {
      done.current = true;
      onReady();
    }
  });
  return null;
}
