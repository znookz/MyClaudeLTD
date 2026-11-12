import { useEffect, useState, useSyncExternalStore } from 'react';

// ============================================================
//  การตั้งค่าของฉาก (จำไว้ใน localStorage): เวลาในฉาก · โหมดประหยัดเครื่อง · แจ้งเตือน
//  ใช้ store แบบ subscribe ธรรมดา เพราะ component ใน <Canvas> (R3F) รับ React context จากข้างนอกไม่ได้
// ============================================================
export type TodSetting = 'auto' | 'day' | 'sunset' | 'night';
export type Tod = 'day' | 'sunset' | 'night';

export interface SceneSettings {
  tod: TodSetting;
  /** โหมดประหยัดเครื่อง: ปิดเงา ลดความละเอียด ลดจำนวนรถ/นก */
  low: boolean;
  notify: boolean;
}

const KEY = 'agent-floor-settings-v1';

function defaultLow(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
}

function load(): SceneSettings {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<SceneSettings>;
    return { tod: j.tod ?? 'auto', low: j.low ?? defaultLow(), notify: j.notify ?? false };
  } catch {
    return { tod: 'auto', low: defaultLow(), notify: false };
  }
}

let state = load();
const listeners = new Set<() => void>();

export function setSceneSettings(patch: Partial<SceneSettings>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ไม่มี storage ก็ไม่เป็นไร */
  }
  listeners.forEach((l) => l());
}

export function useSceneSettings(): SceneSettings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export function todFromHour(h: number): Tod {
  if (h >= 6 && h < 16) return 'day';
  if (h >= 16 && h < 19) return 'sunset';
  return 'night';
}

/** ช่วงเวลาที่ใช้จริง (auto → ตามนาฬิกาเครื่อง อัปเดตทุกนาที) */
export function useTod(): Tod {
  const { tod } = useSceneSettings();
  const [, tick] = useState(0);
  useEffect(() => {
    if (tod !== 'auto') return;
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [tod]);
  return tod === 'auto' ? todFromHour(new Date().getHours()) : tod;
}

export interface SkyPreset {
  bg: string;
  ambient: number;
  ambientColor: string;
  hemi: number;
  hemiSky: string;
  hemiGround: string;
  sun: number;
  sunColor: string;
  sunPos: [number, number, number];
  stars: boolean;
  /** ความสว่างของไฟถนน/ไฟตกแต่ง 0..1 */
  lamp: number;
}

export const SKY: Record<Tod, SkyPreset> = {
  day: {
    bg: '#f3e6ef',
    ambient: 0.75,
    ambientColor: '#fff1e6',
    hemi: 0.9,
    hemiSky: '#fff4f0',
    hemiGround: '#d9cfe8',
    sun: 1.25,
    sunColor: '#ffe9d6',
    sunPos: [6, 14, 9],
    stars: false,
    lamp: 0,
  },
  sunset: {
    bg: '#f6c4b4',
    ambient: 0.6,
    ambientColor: '#ffd6bf',
    hemi: 0.75,
    hemiSky: '#ffcdb0',
    hemiGround: '#c8a6d4',
    sun: 1.0,
    sunColor: '#ffb48a',
    sunPos: [-6, 9, 11],
    stars: false,
    lamp: 0.65,
  },
  night: {
    bg: '#2c2a4e',
    ambient: 0.42,
    ambientColor: '#bfc0ff',
    hemi: 0.55,
    hemiSky: '#9aa4ff',
    hemiGround: '#3d3665',
    sun: 0.4,
    sunColor: '#b9c6ff',
    sunPos: [6, 14, 9],
    stars: true,
    lamp: 1,
  },
};
