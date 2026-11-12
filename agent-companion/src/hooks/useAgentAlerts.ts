import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentState } from '../types';
import { playAlert } from '../utils/sound';
import { bumpStat, recordPeak } from '../utils/stats';

export type ToastKind = 'attention' | 'error' | 'success';
export interface Toast {
  id: number;
  kind: ToastKind;
  sessionId: string;
  title: string;
  text: string;
}

const BASE_TITLE = document.title;
const TOAST_MS = 9000;

/**
 * เฝ้าดู Agent: เปลี่ยนเป็น "รอคุณ" / "ผิดพลาด" / "สำเร็จ" → toast + เสียง (ถ้าเปิด) + Notification ของเบราว์เซอร์ (ตอนอยู่แท็บอื่น)
 * พร้อมใส่จำนวนที่ค้างไว้หน้าชื่อแท็บ และบันทึกสถิติรายวัน
 */
export function useAgentAlerts(agents: AgentState[], opts: { notify: boolean; sound: boolean }) {
  const prev = useRef<Record<string, { status: string; waiting: boolean }>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  useEffect(() => {
    recordPeak(agents.length);
    const fresh: Toast[] = [];
    for (const a of agents) {
      const before = prev.current[a.sessionId];
      const waiting = a.activity === 'waiting';
      if (before) {
        const label = a.task || a.sessionId.slice(0, 8);
        const push = (kind: ToastKind, title: string) =>
          fresh.push({ id: ++seq.current, kind, sessionId: a.sessionId, title, text: label });
        if (waiting && !before.waiting) {
          bumpStat('attention');
          push('attention', 'Agent รอคุณอยู่');
        }
        if (a.status === 'error' && before.status !== 'error') {
          bumpStat('error');
          push('error', 'Agent ผิดพลาด');
        }
        if (a.status === 'success' && before.status !== 'success') {
          bumpStat('success');
          push('success', 'งานสำเร็จ');
        }
      }
    }
    prev.current = Object.fromEntries(agents.map((a) => [a.sessionId, { status: a.status, waiting: a.activity === 'waiting' }]));

    if (fresh.length) {
      setToasts((t) => [...t, ...fresh].slice(-5));
      fresh.forEach((f) => setTimeout(() => dismiss(f.id), TOAST_MS));
      const urgent = fresh.find((f) => f.kind !== 'success');
      if (urgent && opts.sound) playAlert(urgent.kind === 'error' ? 'error' : 'attention');
      if (opts.notify && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        fresh.forEach((f) => new Notification(`${f.title} · Agent Floor`, { body: f.text, tag: f.sessionId }));
      }
    }
  }, [agents, opts.notify, opts.sound, dismiss]);

  // จำนวนที่ต้องการให้คนมาดู แสดงหน้าชื่อแท็บ
  const pending = agents.filter((a) => a.activity === 'waiting' || a.status === 'error').length;
  useEffect(() => {
    document.title = pending > 0 ? `(${pending}) ⚠ ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [pending]);

  return { toasts, dismiss, pending };
}
