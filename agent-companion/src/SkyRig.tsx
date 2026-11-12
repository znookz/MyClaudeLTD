import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { SKY, useSceneSettings, useTod } from './utils/sceneSettings';

/** ท้องฟ้า + แสงทั้งฉาก: เปลี่ยนช่วงเวลา (กลางวัน/เย็น/กลางคืน) แล้วค่อย ๆ ไล่สีและความสว่างให้นุ่ม ๆ */
export default function SkyRig() {
  const tod = useTod();
  const { low } = useSceneSettings();
  const scene = useThree((s) => s.scene);
  const ambient = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const goalBg = useMemo(() => new THREE.Color(), []);
  const goalA = useMemo(() => new THREE.Color(), []);
  const goalS = useMemo(() => new THREE.Color(), []);
  const goalHs = useMemo(() => new THREE.Color(), []);
  const goalHg = useMemo(() => new THREE.Color(), []);
  const sunGoal = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    scene.background = new THREE.Color(SKY.day.bg);
    scene.fog = new THREE.Fog(SKY.day.bg, 55, 130);
    return () => {
      scene.background = null;
      scene.fog = null;
    };
  }, [scene]);

  useFrame((_, dt) => {
    const p = SKY[tod];
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 2.5);
    goalBg.set(p.bg);
    (scene.background as THREE.Color).lerp(goalBg, k);
    (scene.fog as THREE.Fog).color.copy(scene.background as THREE.Color);
    if (ambient.current) {
      ambient.current.intensity += (p.ambient - ambient.current.intensity) * k;
      ambient.current.color.lerp(goalA.set(p.ambientColor), k);
    }
    if (hemi.current) {
      hemi.current.intensity += (p.hemi - hemi.current.intensity) * k;
      hemi.current.color.lerp(goalHs.set(p.hemiSky), k);
      hemi.current.groundColor.lerp(goalHg.set(p.hemiGround), k);
    }
    if (sun.current) {
      sun.current.intensity += (p.sun - sun.current.intensity) * k;
      sun.current.color.lerp(goalS.set(p.sunColor), k);
      sun.current.position.lerp(sunGoal.set(...p.sunPos), k);
    }
  });

  return (
    <>
      <ambientLight ref={ambient} intensity={SKY.day.ambient} color={SKY.day.ambientColor} />
      <hemisphereLight ref={hemi} args={[SKY.day.hemiSky, SKY.day.hemiGround, SKY.day.hemi]} />
      <directionalLight
        ref={sun}
        position={SKY.day.sunPos}
        intensity={SKY.day.sun}
        color={SKY.day.sunColor}
        castShadow={!low}
        shadow-radius={6}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-22}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0005}
      />
      {SKY[tod].stars && <Stars radius={80} depth={40} count={low ? 600 : 1800} factor={3} fade speed={0.6} />}
    </>
  );
}
