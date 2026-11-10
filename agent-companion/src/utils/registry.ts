import type { Object3D } from 'three';

/**
 * ทะเบียนจุดยึด (anchor) ที่หัวไหล่ของ Agent แต่ละตัว
 * CollabBeam ต้องรู้ตำแหน่ง world ของไหล่ทุกเฟรม แต่ไหล่อยู่ลึกใน scene graph ของ Agent อีกตัว
 * → แทนที่จะส่ง ref ไปมาผ่าน React state (ซึ่งจะ re-render ทุกเฟรม) ใช้ Map ธรรมดาที่อ่านใน useFrame
 */
export interface ShoulderAnchors {
  left: Object3D;
  right: Object3D;
}

const anchors = new Map<string, ShoulderAnchors>();

export function registerAnchors(id: string, value: ShoulderAnchors) {
  anchors.set(id, value);
}

export function unregisterAnchors(id: string, value: ShoulderAnchors) {
  if (anchors.get(id) === value) anchors.delete(id);
}

export function getAnchors(id: string): ShoulderAnchors | undefined {
  return anchors.get(id);
}
