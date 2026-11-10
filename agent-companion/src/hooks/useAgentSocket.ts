import { useEffect, useRef, useState } from 'react';
import { normalizeEvent, type AgentEvent } from '../types';

export type SocketStatus = 'disabled' | 'connecting' | 'open' | 'closed';

/**
 * WebSocket client ที่ต่อใหม่อัตโนมัติ (exponential backoff สูงสุด 5 วิ)
 * - onEvent เก็บใน ref → เปลี่ยน callback ได้โดยไม่ต้องตัดการเชื่อมต่อ
 * - ทุกข้อความผ่าน normalizeEvent ก่อน (ข้อมูลจากภายนอกต้องตรวจเสมอ)
 * - รองรับทั้ง event เดี่ยว และ array ของ event
 */
export function useAgentSocket(url: string, enabled: boolean, onEvent: (e: AgentEvent) => void): SocketStatus {
  const [status, setStatus] = useState<SocketStatus>(enabled ? 'connecting' : 'disabled');
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!enabled) {
      setStatus('disabled');
      return;
    }

    let ws: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setStatus('connecting');
      ws = new WebSocket(url);

      ws.onopen = () => {
        retry = 0;
        setStatus('open');
      };
      ws.onmessage = (msg) => {
        try {
          const data: unknown = JSON.parse(String(msg.data));
          const list = Array.isArray(data) ? data : [data];
          for (const item of list) {
            const ev = normalizeEvent(item);
            if (ev) handler.current(ev);
          }
        } catch {
          // ข้อความที่ไม่ใช่ JSON → ข้าม
        }
      };
      ws.onclose = () => {
        if (disposed) return;
        setStatus('closed');
        const wait = Math.min(5000, 500 * 2 ** retry++);
        timer = setTimeout(connect, wait);
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [url, enabled]);

  return status;
}
