/**
 * ระบบเสียงแบบสังเคราะห์ล้วน (ไม่มีไฟล์เสียง)
 *
 * กราฟเสียง:
 *   [oscillator → formant filter → envelope] → speakerInput(id) → analyser(id) → master → destination
 *
 * Agent แต่ละตัวมี "ช่องเสียง" (speaker chain) ของตัวเอง ที่มี AnalyserNode คั่นอยู่
 * Agent3D จะอ่านความดังจาก analyser ของตัวเองทุกเฟรม → ใช้ขยับปาก LED
 * ตัวที่ไม่ได้พูด analyser จะได้ค่า ≈ 0 ปากจึงหุบเองโดยไม่ต้องมี state "ใครกำลังพูด"
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

interface SpeakerChain {
  input: GainNode;
  analyser: AnalyserNode;
  buffer: Float32Array<ArrayBuffer>;
  smoothed: number;
}

const speakers = new Map<string, SpeakerChain>();

function ensureContext(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;

    // คอมเพรสเซอร์กันเสียงแตกเวลาหลายตัวพูดพร้อมกัน
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    master.connect(comp);
    comp.connect(ctx.destination);
  }
  return ctx;
}

/** เบราว์เซอร์บังคับให้ AudioContext เริ่มจาก user gesture (คลิก) เท่านั้น */
export async function unlockAudio(): Promise<boolean> {
  const c = ensureContext();
  if (c.state !== 'running') {
    try {
      await c.resume();
    } catch {
      return false;
    }
  }
  return c.state === 'running';
}

export function isAudioReady(): boolean {
  return !!ctx && ctx.state === 'running' && !muted;
}

export function setMuted(value: boolean) {
  muted = value;
  if (ctx && master) master.gain.setTargetAtTime(value ? 0 : 0.55, ctx.currentTime, 0.05);
}

function getSpeaker(id: string): SpeakerChain {
  const c = ensureContext();
  let s = speakers.get(id);
  if (!s) {
    const input = c.createGain();
    const analyser = c.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.3;
    input.connect(analyser);
    analyser.connect(master!);
    s = { input, analyser, buffer: new Float32Array(analyser.fftSize), smoothed: 0 };
    speakers.set(id, s);
  }
  return s;
}

export function releaseSpeaker(id: string) {
  const s = speakers.get(id);
  if (!s) return;
  s.input.disconnect();
  s.analyser.disconnect();
  speakers.delete(id);
}

/**
 * ความดังปัจจุบันของ Agent (0..1) จาก RMS ของคลื่นเสียง
 * - attack เร็ว / release ช้ากว่า → ปากเปิดทันทีเมื่อเสียงมา แต่หุบนุ่ม ๆ ไม่กระตุก
 */
export function getSpeakerLevel(id: string): number {
  const s = speakers.get(id);
  if (!s || !ctx || ctx.state !== 'running') return 0;
  s.analyser.getFloatTimeDomainData(s.buffer);
  let sum = 0;
  for (let i = 0; i < s.buffer.length; i++) sum += s.buffer[i] * s.buffer[i];
  const rms = Math.sqrt(sum / s.buffer.length);
  const target = Math.min(1, rms * 6);
  const k = target > s.smoothed ? 0.6 : 0.15;
  s.smoothed += (target - s.smoothed) * k;
  return s.smoothed;
}

/** เสียงประจำตัว: hash จาก sessionId → pitch คงที่ระหว่าง 110–330 Hz (ทุ้ม → แหลม) */
export function voicePitchFor(sessionId: string): number {
  let h = 2166136261;
  for (let i = 0; i < sessionId.length; i++) {
    h ^= sessionId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const unit = ((h >>> 0) % 1000) / 1000;
  return 110 + unit * 220;
}

/** Success jingle: C5 → E5 → G5 (triangle + sine คู่แปดเพื่อให้ใส) */
export function playSuccessJingle() {
  if (!isAudioReady()) return;
  const c = ctx!;
  const notes = [523.25, 659.25, 783.99];
  const start = c.currentTime + 0.02;

  notes.forEach((freq, i) => {
    const t = start + i * 0.13;
    const dur = i === notes.length - 1 ? 0.55 : 0.16;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.35, t + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    env.connect(master!);

    const tri = c.createOscillator();
    tri.type = 'triangle';
    tri.frequency.value = freq;
    const shimmer = c.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.value = freq * 2;
    const shimmerGain = c.createGain();
    shimmerGain.gain.value = 0.25;

    tri.connect(env);
    shimmer.connect(shimmerGain).connect(env);
    tri.start(t);
    shimmer.start(t);
    tri.stop(t + dur + 0.05);
    shimmer.stop(t + dur + 0.05);
  });
}

/** เสียงแจ้งเตือน: attention = ติ๊งต่อง (รอคุณ), error = โทนต่ำสองจังหวะ */
export function playAlert(kind: 'attention' | 'error') {
  if (!isAudioReady()) return;
  const c = ctx!;
  const notes = kind === 'attention' ? [880, 1174.66] : [330, 247];
  const start = c.currentTime + 0.02;
  notes.forEach((freq, i) => {
    const t = start + i * 0.2;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    env.connect(master!);
    const o = c.createOscillator();
    o.type = kind === 'attention' ? 'sine' : 'triangle';
    o.frequency.value = freq;
    o.connect(env);
    o.start(t);
    o.stop(t + 0.35);
  });
}

// formant คร่าว ๆ ของสระ a / e / i / o / u → ทำให้ฟังเหมือน "คำพูด" ไม่ใช่แค่เสียงบี๊บ
const FORMANTS = [
  [800, 1200],
  [500, 1900],
  [320, 2300],
  [500, 900],
  [350, 800],
];

/**
 * เสียงพึมพำแบบ Animalese/Simlish: ต่อพยางค์สั้น ๆ ที่ pitch และสระสุ่ม
 * @returns ระยะเวลาเสียง (วินาที) เพื่อให้ผู้เรียกจัดคิวคนพูดถัดไปได้
 */
export function playMumble(speakerId: string, pitch: number, syllables = 4 + Math.floor(Math.random() * 6)): number {
  if (!isAudioReady()) return 0;
  const c = ctx!;
  const speaker = getSpeaker(speakerId);
  let t = c.currentTime + 0.02;
  const begin = t;

  for (let i = 0; i < syllables; i++) {
    const dur = 0.07 + Math.random() * 0.08;
    const f0 = pitch * (0.85 + Math.random() * 0.4);
    // ประโยคท้าย ๆ เสียงลง / ถ้าเป็นคำถามเสียงขึ้น → ฟังเป็นธรรมชาติขึ้น
    const contour = i === syllables - 1 ? (Math.random() < 0.4 ? 1.25 : 0.8) : 1;

    const osc = c.createOscillator();
    osc.type = Math.random() < 0.5 ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.linearRampToValueAtTime(f0 * contour, t + dur);

    const [f1, f2] = FORMANTS[Math.floor(Math.random() * FORMANTS.length)];
    const bp1 = c.createBiquadFilter();
    bp1.type = 'bandpass';
    bp1.frequency.value = f1;
    bp1.Q.value = 4;
    const bp2 = c.createBiquadFilter();
    bp2.type = 'bandpass';
    bp2.frequency.value = f2;
    bp2.Q.value = 6;
    const mix = c.createGain();
    mix.gain.value = 1;

    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.9, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(bp1).connect(mix);
    osc.connect(bp2).connect(mix);
    mix.connect(env).connect(speaker.input);

    osc.start(t);
    osc.stop(t + dur + 0.02);
    t += dur + 0.015 + Math.random() * 0.035;
  }
  return t - begin;
}
