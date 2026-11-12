import { useSyncExternalStore } from 'react';

// สถิติของวัน (เก็บใน localStorage แยกตามวัน → พรุ่งนี้เริ่มนับใหม่เอง)
export interface DayStats {
  day: string;
  success: number;
  error: number;
  attention: number;
  coffee: number;
  breaks: number;
  peak: number;
}

const KEY = 'agent-floor-stats-v1';
const today = () => new Date().toISOString().slice(0, 10);
const blank = (): DayStats => ({ day: today(), success: 0, error: 0, attention: 0, coffee: 0, breaks: 0, peak: 0 });

function load(): DayStats {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? 'null') as DayStats | null;
    if (j && j.day === today()) return { ...blank(), ...j };
  } catch {
    /* ignore */
  }
  return blank();
}

let state = load();
const listeners = new Set<() => void>();

function commit(next: DayStats) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function bumpStat(key: Exclude<keyof DayStats, 'day' | 'peak'>) {
  const base = state.day === today() ? state : blank();
  commit({ ...base, [key]: base[key] + 1 });
}

export function recordPeak(n: number) {
  const base = state.day === today() ? state : blank();
  if (n > base.peak) commit({ ...base, peak: n });
}

export function resetStats() {
  commit(blank());
}

export function useStats(): DayStats {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}
