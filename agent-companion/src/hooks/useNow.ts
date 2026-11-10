import { useEffect, useState } from 'react';

/** เวลาปัจจุบันที่อัปเดตทุก `intervalMs` — ใช้แสดงเวลาที่ผ่านไปโดยไม่ต้อง re-render ทั้งแอป */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
