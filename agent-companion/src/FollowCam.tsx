import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { getAnchors } from './utils/registry';

const FOLLOW_DISTANCE = 9;
const _l = new Vector3();
const _r = new Vector3();
const _goal = new Vector3();
const _off = new Vector3();

/**
 * กล้องตาม Agent: จุดหมุน (target) ค่อย ๆ เลื่อนตามตัว โดยรักษามุม/ระยะที่ผู้ใช้หมุนหรือซูมไว้เอง
 * ตอนเริ่มตามจะซูมเข้ามาที่ระยะ FOLLOW_DISTANCE; ถ้า Agent หายไปจากฉากจะเรียก onLost เพื่อหยุดตาม
 */
export default function FollowCam({ id, onLost }: { id: string | null; onLost: () => void }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: Vector3; update: () => void } | null;
  const zoomIn = useRef(false);
  const missing = useRef(0);

  useEffect(() => {
    zoomIn.current = !!id;
    missing.current = 0;
  }, [id]);

  useFrame((_, dt) => {
    if (!id || !controls) return;
    const a = getAnchors(id);
    if (!a) {
      // รอสั้น ๆ เผื่อกำลังเกิดใหม่ (ถ้าหายนานเกิน 1 วินาทีถือว่าออกไปแล้ว)
      missing.current += dt;
      if (missing.current > 1) onLost();
      return;
    }
    missing.current = 0;
    a.left.getWorldPosition(_l);
    a.right.getWorldPosition(_r);
    _goal.addVectors(_l, _r).multiplyScalar(0.5);
    _goal.y *= 0.7;

    const k = 1 - Math.exp(-Math.min(dt, 0.05) * 5);
    _off.subVectors(camera.position, controls.target); // มุม/ระยะปัจจุบัน (ผู้ใช้หมุนเองได้)
    if (zoomIn.current) {
      const len = _off.length();
      if (len > FOLLOW_DISTANCE + 0.2) _off.multiplyScalar(1 - (1 - FOLLOW_DISTANCE / len) * k * 0.8);
      else zoomIn.current = false;
    }
    controls.target.lerp(_goal, k);
    camera.position.copy(controls.target).add(_off);
    controls.update();
  });

  return null;
}
