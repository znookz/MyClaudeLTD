import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { inputLock } from './utils/racingGame';

const KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const SPEED = 0.9; // สัดส่วนของระยะกล้อง ต่อวินาที

/** กดลูกศรเพื่อเลื่อนกล้อง (pan) ไปตามพื้น — ใช้คู่กับ OrbitControls makeDefault */
export default function KeyboardPan() {
  const pressed = useRef(new Set<string>());
  const controls = useThree((s) => s.controls) as { target: Vector3; update: () => void } | null;
  const camera = useThree((s) => s.camera);
  const fwd = useRef(new Vector3());
  const right = useRef(new Vector3());
  const move = useRef(new Vector3());

  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (inputLock.racing) {
        pressed.current.clear();
        return; // ผู้ใช้กำลังขับ Racing Rig → ปล่อยให้เกมจัดการลูกศร
      }
      if (!KEYS.has(e.key) || typing(e)) return;
      e.preventDefault();
      pressed.current.add(e.key);
    };
    const up = (e: KeyboardEvent) => pressed.current.delete(e.key);
    const clear = () => pressed.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  useFrame((_, dt) => {
    const k = pressed.current;
    if (!controls || k.size === 0) return;
    camera.getWorldDirection(fwd.current);
    fwd.current.y = 0;
    if (fwd.current.lengthSq() < 1e-6) return;
    fwd.current.normalize();
    right.current.set(-fwd.current.z, 0, fwd.current.x);
    const dir = move.current.set(0, 0, 0);
    if (k.has('ArrowUp')) dir.add(fwd.current);
    if (k.has('ArrowDown')) dir.sub(fwd.current);
    if (k.has('ArrowRight')) dir.add(right.current);
    if (k.has('ArrowLeft')) dir.sub(right.current);
    if (dir.lengthSq() === 0) return;
    const dist = camera.position.distanceTo(controls.target);
    dir.normalize().multiplyScalar(dist * SPEED * Math.min(dt, 0.05));
    camera.position.add(dir);
    controls.target.add(dir);
    controls.update();
  });

  return null;
}
