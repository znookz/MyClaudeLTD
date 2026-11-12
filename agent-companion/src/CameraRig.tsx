import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';

export interface CamView {
  id: string;
  pos: [number, number, number];
  target: [number, number, number];
  /** เปลี่ยนค่าทุกครั้งที่กดปุ่ม เพื่อให้กดซ้ำแล้วกล้องกลับมาที่เดิมได้ */
  n: number;
}

/** บินกล้องไปมุมที่เลือกแบบนุ่ม ๆ (ถ้าผู้ใช้เริ่มลากกล้องเองจะยกเลิกทันที) */
export default function CameraRig({ view }: { view: CamView }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as
    | { target: Vector3; update: () => void; addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void }
    | null;
  const goal = useRef<{ pos: Vector3; target: Vector3 } | null>(null);
  const size = useThree((s) => s.size);
  // จอแคบ (มือถือแนวตั้ง) → ถอยกล้องออกให้เห็นฉากครบ
  const fit = Math.min(2.2, Math.max(1, 1.7 / (size.width / size.height)));
  const fitted = useRef(false);

  useEffect(() => {
    if (!controls || fitted.current || size.width === 0) return;
    fitted.current = true;
    camera.position.sub(controls.target).multiplyScalar(fit).add(controls.target);
    controls.update();
  }, [controls, camera, fit, size.width]);

  useEffect(() => {
    if (view.n === 0) return;
    const target = new Vector3(...view.target);
    goal.current = { pos: target.clone().add(new Vector3(...view.pos).sub(target).multiplyScalar(fit)), target };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fit เปลี่ยนตามขนาดจอ แต่ไม่ต้องบินกล้องใหม่เอง
  }, [view]);

  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      goal.current = null;
    };
    controls.addEventListener('start', cancel);
    return () => controls.removeEventListener('start', cancel);
  }, [controls]);

  useFrame((_, dt) => {
    const g = goal.current;
    if (!g || !controls) return;
    const k = 1 - Math.exp(-Math.min(dt, 0.05) * 4);
    camera.position.lerp(g.pos, k);
    controls.target.lerp(g.target, k);
    controls.update();
    if (camera.position.distanceTo(g.pos) < 0.05 && controls.target.distanceTo(g.target) < 0.05) goal.current = null;
  });

  return null;
}
