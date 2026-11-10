/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL ของ bridge (ค่าเริ่มต้น ws://localhost:8080) */
  readonly VITE_AGENT_WS?: string;
}
