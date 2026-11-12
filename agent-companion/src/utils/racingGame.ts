/**
 * เกมแข่งรถ pseudo-3D (สไตล์ OutRun) วาดลง canvas กว้าง 3 ส่วน → ใช้เป็น 3 จอต่อกันของ Racing Rig
 * - โหมด autopilot: Agent นั่งอยู่ → ขับเอง (เปลี่ยนเกียร์เอง หลบรถคู่แข่ง)
 * - โหมด manual: ผู้ใช้คลิก rig เพื่อ takeover → ←/→ A/D เลี้ยว · ↑/W เร่ง · ↓/S เบรก · Q/E เกียร์ลง/ขึ้น · Esc ออก
 */

export const PANEL_W = 192;
export const PANEL_H = 130;
export const CANVAS_W = PANEL_W * 3;
export const CANVAS_H = PANEL_H;

/** flag ร่วม: ผู้ใช้กำลังควบคุมเกมแข่งรถอยู่ → KeyboardPan ต้องหยุดฟังลูกศร */
export const inputLock = { racing: false };

/** ค่าสดจากเกม (มี rig เดียว) → ใช้หมุนพวงมาลัย/คันเกียร์/แป้นเหยียบ และท่าของ Agent */
export const racingTelemetry = {
  steer: 0, // -1..1 (+ = เลี้ยวขวา)
  gear: 1,
  throttle: 0,
  brake: 0,
  shiftPulse: 0, // 1 → 0 หลังเปลี่ยนเกียร์
  kmh: 0,
  manual: false,
};

// ---------------- ค่าคงที่ ----------------
const SEG_L = 200; // ความยาวต่อ segment
const ROAD_W = 1800; // ครึ่งความกว้างถนน
const CAM_H = 900;
const K = 70; // px ต่อหน่วยที่ scale 1
const HZ = 44; // แนวขอบฟ้า (y)
const NEAR = 500; // กล้องอยู่หลังตำแหน่ง pos เท่านี้
const PLAYER_Z = 350; // รถผู้เล่นอยู่หน้ากล้องเท่านี้
const DRAW = 80;
const MAX_SPEED = 12000; // = 290 km/h
const KMH = 290 / MAX_SPEED;
const GEAR_TOP_KMH = [0, 70, 120, 165, 210, 250, 290];
const GEAR_ACC = [0, 3800, 2800, 2200, 1750, 1400, 1150];
const OFFROAD_LIMIT = 3000;
const STEP = 1 / 30;

const gearTopU = (g: number) => GEAR_TOP_KMH[g] / KMH;

// ---------------- สนาม ----------------
interface Seg {
  y1: number;
  y2: number;
  curve: number;
  deco: number; // 0 ไม่มี · ±n = ต้นไม้ด้านขวา/ซ้าย (ระยะ) · 9 = ป้าย
}

const easeIn = (a: number, b: number, p: number) => a + (b - a) * p * p;
const easeInOut = (a: number, b: number, p: number) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);

function buildTrack(): Seg[] {
  const segs: Seg[] = [];
  let lastY = 0;
  const add = (enter: number, hold: number, leave: number, curve: number, dy: number) => {
    const total = enter + hold + leave;
    const startY = lastY;
    const endY = startY + dy * SEG_L;
    for (let i = 0; i < total; i++) {
      let c = curve;
      if (i < enter) c = easeIn(0, curve, i / enter);
      else if (i >= enter + hold) c = easeInOut(curve, 0, (i - enter - hold) / leave);
      segs.push({
        y1: easeInOut(startY, endY, i / total),
        y2: easeInOut(startY, endY, (i + 1) / total),
        curve: c,
        deco: 0,
      });
    }
    lastY = endY;
  };
  const straight = (n: number) => add(0, n, 0, 0, 0);
  const bend = (n: number, c: number, dy = 0) => add(Math.floor(n / 3), Math.floor(n / 3), n - 2 * Math.floor(n / 3), c, dy);
  const hill = (n: number, dy: number) => add(0, n, 0, 0, dy);
  for (const m of [1, -1]) {
    straight(30);
    bend(60, 3 * m);
    hill(50, 10);
    bend(50, -4 * m, 6);
    straight(30);
    hill(60, -16);
    bend(70, 5 * m);
    bend(60, -3 * m, 4);
    hill(50, 8);
    hill(40, -12);
    bend(60, -5 * m);
    straight(40);
  }
  // ริมทาง: ต้นไม้/ป้าย แบบ pseudo-random คงที่
  for (let i = 0; i < segs.length; i++) {
    const h = Math.sin(i * 12.9898) * 43758.5453;
    const r = h - Math.floor(h);
    if (i % 6 === 0) segs[i].deco = (r > 0.5 ? 1 : -1) * (1.3 + r * 1.2);
    else if (i % 37 === 0) segs[i].deco = 9;
  }
  return segs;
}

let TRACK: Seg[] | null = null;
const getTrack = () => (TRACK ??= buildTrack());

interface Car {
  z: number;
  offset: number;
  speed: number;
  drift: number;
  color: string;
}

const CAR_COLORS = ['#38bdf8', '#facc15', '#a78bfa', '#f472b6', '#34d399', '#fb923c', '#e2e8f0', '#22d3ee'];

const fmtTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
};
const approach = (v: number, target: number, rate: number) =>
  v < target ? Math.min(target, v + rate) : Math.max(target, v - rate);

export class RacingGame {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private segs = getTrack();
  private len = this.segs.length * SEG_L;
  private cars: Car[] = [];
  private skyGrad: CanvasGradient;

  manual = false;
  hover = false;
  private pos = 0;
  private playerX = 0;
  private speed = 0;
  private gear = 1;
  private steer = 0;
  private throttle = 0;
  private brake = 0;
  private shiftCd = 0;
  private shiftPulse = 0;
  private shake = 0;
  private skyOff = 0;
  private lap = 1;
  private lapTime = 0;
  private bestLap = 0;
  private acc = 0;
  private clock = 0;
  private limiter = false;
  private dirty = true;
  private keys = { left: false, right: false, up: false, down: false };
  private audio: { ac: AudioContext; osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.skyGrad = this.ctx.createLinearGradient(0, 0, 0, HZ);
    this.skyGrad.addColorStop(0, '#1d4ed8');
    this.skyGrad.addColorStop(1, '#fdba74');
    for (let i = 0; i < 10; i++) {
      this.cars.push({
        z: (this.len / 10) * i + 1500 + ((i * 7919) % 900),
        offset: ((i * 37) % 17) / 17 * 1.4 - 0.7,
        speed: 3000 + ((i * 1117) % 4000),
        drift: (i % 2 ? 1 : -1) * (0.05 + (i % 3) * 0.04),
        color: CAR_COLORS[i % CAR_COLORS.length],
      });
    }
    this.render();
  }

  // ---------------- โหมดผู้ใช้ ----------------
  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    let used = true;
    if (k === 'escape') this.exitManual();
    else if (k === 'arrowleft' || k === 'a') this.keys.left = true;
    else if (k === 'arrowright' || k === 'd') this.keys.right = true;
    else if (k === 'arrowup' || k === 'w') this.keys.up = true;
    else if (k === 'arrowdown' || k === 's') this.keys.down = true;
    else if (k === 'q' && !e.repeat) this.shift(-1);
    else if (k === 'e' && !e.repeat) this.shift(1);
    else used = false;
    if (used) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') this.keys.left = false;
    else if (k === 'arrowright' || k === 'd') this.keys.right = false;
    else if (k === 'arrowup' || k === 'w') this.keys.up = false;
    else if (k === 'arrowdown' || k === 's') this.keys.down = false;
  };
  private onBlur = () => {
    this.keys = { left: false, right: false, up: false, down: false };
  };

  enterManual() {
    if (this.manual) return;
    this.manual = true;
    inputLock.racing = true;
    racingTelemetry.manual = true;
    this.keys = { left: false, right: false, up: false, down: false };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.startSound();
    this.dirty = true;
  }

  exitManual() {
    if (!this.manual) return;
    this.manual = false;
    inputLock.racing = false;
    racingTelemetry.manual = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.stopSound();
    this.dirty = true;
  }

  setHover(v: boolean) {
    if (this.hover !== v) {
      this.hover = v;
      this.dirty = true;
    }
  }

  dispose() {
    this.exitManual();
  }

  private shift(d: number) {
    const g = Math.min(6, Math.max(1, this.gear + d));
    if (g !== this.gear) {
      this.gear = g;
      this.shiftPulse = 1;
    }
  }

  // ---------------- เสียงเครื่อง ----------------
  private startSound() {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ac = new AC();
      const osc = ac.createOscillator();
      const osc2 = ac.createOscillator();
      const gain = ac.createGain();
      const filter = ac.createBiquadFilter();
      osc.type = 'sawtooth';
      osc2.type = 'square';
      filter.type = 'lowpass';
      gain.gain.value = 0;
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(ac.destination);
      osc.start();
      osc2.start();
      this.audio = { ac, osc, osc2, gain, filter };
    } catch {
      this.audio = null;
    }
  }

  private stopSound() {
    const a = this.audio;
    this.audio = null;
    if (!a) return;
    try {
      a.gain.gain.setTargetAtTime(0, a.ac.currentTime, 0.05);
      window.setTimeout(() => {
        a.osc.stop();
        a.osc2.stop();
        void a.ac.close();
      }, 250);
    } catch {
      /* ignore */
    }
  }

  private updateSound(rpm: number) {
    const a = this.audio;
    if (!a) return;
    const t = a.ac.currentTime;
    const f = 40 + rpm * 190;
    a.osc.frequency.setTargetAtTime(f, t, 0.03);
    a.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    a.filter.frequency.setTargetAtTime(350 + rpm * 1600 + this.throttle * 700, t, 0.05);
    a.gain.gain.setTargetAtTime(0.03 + this.throttle * 0.05 + rpm * 0.02, t, 0.05);
  }

  // ---------------- logic ----------------
  private segAt(z: number): Seg {
    const n = this.segs.length;
    return this.segs[((Math.floor(z / SEG_L) % n) + n) % n];
  }

  private wrapDiff(d: number) {
    const h = this.len / 2;
    return ((((d + h) % this.len) + this.len) % this.len) - h;
  }

  private autopilot(dt: number) {
    const spPct = this.speed / MAX_SPEED;
    const pz = this.pos + PLAYER_Z;
    let maxC = 0;
    for (let k = 0; k < 14; k++) maxC = Math.max(maxC, Math.abs(this.segAt(pz + k * SEG_L).curve));
    const target = Math.max(95, 255 - maxC * 28) / KMH;
    let brake = 0;
    let throttle = Math.min(1, Math.max(0, (target - this.speed) / 600));
    if (this.speed > target) brake = Math.min(0.8, (this.speed - target) / 1500);
    // หลบรถคู่แข่ง
    let targetX = 0;
    for (const c of this.cars) {
      const dz = this.wrapDiff(c.z - pz);
      if (dz > 0 && dz < 2800 && Math.abs(c.offset - this.playerX) < 0.55) {
        targetX = Math.max(-0.8, Math.min(0.8, c.offset > this.playerX ? c.offset - 0.7 : c.offset + 0.7));
        if (dz < 1000 && this.speed > c.speed) {
          brake = Math.max(brake, 0.5);
          throttle = 0;
        }
        break;
      }
    }
    const cmd = (targetX - this.playerX) * 2.5 + 0.22 * spPct * this.segAt(pz).curve;
    this.throttle = throttle;
    this.brake = brake;
    this.steer = approach(this.steer, Math.max(-1, Math.min(1, cmd)), dt * 6);
    // เกียร์อัตโนมัติ
    this.shiftCd -= dt;
    const r = this.speed / gearTopU(this.gear);
    if (this.shiftCd <= 0) {
      if (r > 0.93 && this.gear < 6) {
        this.shift(1);
        this.shiftCd = 0.5;
      } else if (r < 0.5 && this.gear > 1) {
        this.shift(-1);
        this.shiftCd = 0.5;
      }
    }
  }

  private step(dt: number) {
    this.clock += dt;
    if (this.manual) {
      this.throttle = approach(this.throttle, this.keys.up ? 1 : 0, dt * 6);
      this.brake = approach(this.brake, this.keys.down ? 1 : 0, dt * 8);
      const s = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
      this.steer = approach(this.steer, s, dt * 5);
    } else {
      this.autopilot(dt);
    }

    const topU = gearTopU(this.gear);
    const r = this.speed / topU;
    this.limiter = r >= 1 && this.throttle > 0.5;
    let a = 0;
    if (this.throttle > 0 && r < 1) {
      a = this.throttle * GEAR_ACC[this.gear] * (1 - r * 0.9) * (r < 0.2 && this.gear > 1 ? 0.35 : 1);
    }
    let decel = 350 + this.speed * 0.1 + (1 - this.throttle) * 400 + this.brake * 5500;
    if (r > 1.02) decel += (r - 1) * 6000; // engine brake เมื่อรอบเกิน
    this.speed += (a - decel) * dt;
    if (Math.abs(this.playerX) > 1 && this.speed > OFFROAD_LIMIT) this.speed -= 6000 * dt;
    this.speed = Math.max(0, Math.min(MAX_SPEED, this.speed));

    // เลี้ยว + แรงเหวี่ยงตามโค้ง
    const sp = this.speed / MAX_SPEED;
    const seg = this.segAt(this.pos + PLAYER_Z);
    this.playerX += this.steer * dt * 2.8 * sp;
    this.playerX -= dt * 2 * sp * sp * seg.curve * 0.3;
    this.playerX = Math.max(-2, Math.min(2, this.playerX));
    this.skyOff += seg.curve * sp * dt * 14;

    // เดินทาง + นับรอบ
    this.pos += this.speed * dt;
    this.lapTime += dt;
    if (this.pos >= this.len) {
      this.pos -= this.len;
      if (this.lapTime > 5 && (this.bestLap === 0 || this.lapTime < this.bestLap)) this.bestLap = this.lapTime;
      this.lap++;
      this.lapTime = 0;
    }

    // รถคู่แข่ง + ชน
    const pz = this.pos + PLAYER_Z;
    for (const c of this.cars) {
      c.z = (c.z + c.speed * dt) % this.len;
      c.offset += c.drift * dt;
      if (c.offset > 0.8 || c.offset < -0.8) c.drift = -c.drift;
      const dz = this.wrapDiff(c.z - pz);
      if (Math.abs(dz) < 350 && Math.abs(c.offset - this.playerX) < 0.3 && this.shake <= 0) {
        if (this.speed > c.speed) {
          this.speed = c.speed * 0.5;
          this.pos = (((c.z - PLAYER_Z - 380) % this.len) + this.len) % this.len;
        }
        this.playerX += c.offset > this.playerX ? -0.25 : 0.25;
        this.shake = 0.5;
      }
    }
    this.shake = Math.max(0, this.shake - dt);
    this.shiftPulse = Math.max(0, this.shiftPulse - dt * 2.5);

    // telemetry + เสียง
    const T = racingTelemetry;
    T.steer = this.steer;
    T.gear = this.gear;
    T.throttle = this.throttle;
    T.brake = this.brake;
    T.shiftPulse = this.shiftPulse;
    T.kmh = this.speed * KMH;
    this.updateSound(Math.min(1.05, 0.15 + 0.85 * Math.min(1, this.speed / topU)));
  }

  /** เรียกทุกเฟรม — คืน true ถ้ามีการวาดใหม่ (ให้ผู้เรียกตั้ง texture.needsUpdate) */
  tick(dt: number, active: boolean): boolean {
    if (!active && !this.manual) {
      if (this.hover) {
        this.acc += dt;
        if (this.acc > 0.25) {
          this.acc = 0;
          this.dirty = true; // ให้ข้อความกะพริบตอน hover
        }
      }
      if (!this.dirty) return false;
      this.render();
      return true;
    }
    this.acc += Math.min(dt, 0.1);
    if (this.acc < STEP) return false;
    let n = 0;
    while (this.acc >= STEP && n < 3) {
      this.step(STEP);
      this.acc -= STEP;
      n++;
    }
    this.acc = 0;
    this.render();
    return true;
  }

  // ---------------- วาด ----------------
  private poly(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number, col: string) {
    const c = this.ctx;
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.lineTo(x3, y3);
    c.lineTo(x4, y4);
    c.closePath();
    c.fill();
  }

  private drawCar(cx: number, by: number, w: number, color: string, braking: boolean) {
    const c = this.ctx;
    const h = w * 0.62;
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(cx - w * 0.52, by - h * 0.06, w * 1.04, h * 0.14);
    c.fillStyle = '#0f172a';
    c.fillRect(cx - w * 0.5, by - h * 0.32, w * 0.16, h * 0.34);
    c.fillRect(cx + w * 0.34, by - h * 0.32, w * 0.16, h * 0.34);
    c.fillStyle = color;
    c.fillRect(cx - w * 0.46, by - h * 0.62, w * 0.92, h * 0.46);
    this.poly(cx - w * 0.34, by - h * 0.62, cx + w * 0.34, by - h * 0.62, cx + w * 0.26, by - h, cx - w * 0.26, by - h, color);
    c.fillStyle = '#1e293b';
    c.fillRect(cx - w * 0.24, by - h * 0.96, w * 0.48, h * 0.3);
    c.fillStyle = braking ? '#ff2020' : '#991b1b';
    c.fillRect(cx - w * 0.44, by - h * 0.5, w * 0.2, h * 0.14);
    c.fillRect(cx + w * 0.24, by - h * 0.5, w * 0.2, h * 0.14);
  }

  private drawTree(sx: number, by: number, s: number, big: boolean) {
    const c = this.ctx;
    const h = s * (big ? 3600 : 2600);
    c.fillStyle = '#78350f';
    c.fillRect(sx - h * 0.04, by - h * 0.3, h * 0.08, h * 0.3);
    c.fillStyle = big ? '#166534' : '#15803d';
    c.beginPath();
    c.moveTo(sx - h * 0.25, by - h * 0.25);
    c.lineTo(sx + h * 0.25, by - h * 0.25);
    c.lineTo(sx, by - h);
    c.closePath();
    c.fill();
  }

  private text(s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left') {
    const c = this.ctx;
    c.font = `bold ${size}px monospace`;
    c.textAlign = align;
    c.fillStyle = 'rgba(0,0,0,0.7)';
    c.fillText(s, x + 1, y + 1);
    c.fillStyle = color;
    c.fillText(s, x, y);
  }

  render() {
    this.dirty = false;
    const c = this.ctx;
    const W = CANVAS_W;
    const H = CANVAS_H;
    c.save();
    if (this.shake > 0) c.translate((Math.random() - 0.5) * 6 * this.shake, (Math.random() - 0.5) * 4 * this.shake);

    // ท้องฟ้า + ภูเขา (เลื่อนตามโค้ง)
    c.fillStyle = this.skyGrad;
    c.fillRect(-8, 0, W + 16, HZ + 1);
    c.fillStyle = '#fde68a';
    c.beginPath();
    c.arc(((W * 0.72 - this.skyOff * 0.2) % W + W) % W, HZ - 16, 9, 0, Math.PI * 2);
    c.fill();
    for (let layer = 0; layer < 2; layer++) {
      const off = this.skyOff * (layer + 1) * 0.6;
      c.fillStyle = layer === 0 ? '#6d28d9' : '#3730a3';
      c.beginPath();
      c.moveTo(-8, HZ);
      for (let x = -8; x <= W + 8; x += 8) {
        const u = (x + off) * (layer ? 0.035 : 0.02);
        c.lineTo(x, HZ - 8 - layer * 4 - 9 * (Math.sin(u) * 0.6 + Math.sin(u * 2.7) * 0.4 + 1) * (layer ? 0.6 : 1));
      }
      c.lineTo(W + 8, HZ);
      c.closePath();
      c.fill();
    }
    c.fillStyle = '#15803d';
    c.fillRect(-8, HZ, W + 16, H - HZ + 8);

    // ฉาก/ถนน
    const n = this.segs.length;
    const base = Math.floor(this.pos / SEG_L);
    const pct = (this.pos % SEG_L) / SEG_L;
    const baseSeg = this.segs[base % n];
    const camY = CAM_H + baseSeg.y1 + (baseSeg.y2 - baseSeg.y1) * pct;
    const camX = this.playerX * ROAD_W;
    const camZ = this.pos - NEAR;
    let x = 0;
    let dx = -baseSeg.curve * pct;
    interface P {
      idx: number;
      x1: number;
      y1: number;
      w1: number;
      x2: number;
      y2: number;
      w2: number;
      s: number;
      clip: number;
    }
    const vis: P[] = [];
    let maxY = H + 20;
    for (let k = 0; k < DRAW; k++) {
      const idx = base + k;
      const seg = this.segs[idx % n];
      const z1 = idx * SEG_L - camZ;
      const z2 = z1 + SEG_L;
      const s1 = K / z1;
      const s2 = K / z2;
      const x1 = W / 2 + s1 * (x - camX);
      const y1 = HZ + s1 * (camY - seg.y1);
      const x2 = W / 2 + s2 * (x + dx - camX);
      const y2 = HZ + s2 * (camY - seg.y2);
      x += dx;
      dx += seg.curve;
      if (y2 >= y1 || y2 >= maxY) continue;
      vis.push({ idx, x1, y1, w1: s1 * ROAD_W, x2, y2, w2: s2 * ROAD_W, s: s1, clip: maxY });
      maxY = y2;
    }
    for (let i = vis.length - 1; i >= 0; i--) {
      const p = vis[i];
      const alt = Math.floor(p.idx / 3) % 2 === 0;
      const wi = p.idx % n;
      c.fillStyle = alt ? '#15803d' : '#166534';
      c.fillRect(-8, p.y2, W + 16, p.y1 - p.y2 + 1);
      const r1 = p.w1 * 0.12;
      const r2 = p.w2 * 0.12;
      const rum = alt ? '#ef4444' : '#f8fafc';
      this.poly(p.x1 - p.w1 - r1, p.y1, p.x1 - p.w1, p.y1, p.x2 - p.w2, p.y2, p.x2 - p.w2 - r2, p.y2, rum);
      this.poly(p.x1 + p.w1 + r1, p.y1, p.x1 + p.w1, p.y1, p.x2 + p.w2, p.y2, p.x2 + p.w2 + r2, p.y2, rum);
      this.poly(
        p.x1 - p.w1, p.y1, p.x1 + p.w1, p.y1, p.x2 + p.w2, p.y2, p.x2 - p.w2, p.y2,
        wi < 2 ? '#e5e7eb' : alt ? '#4b5563' : '#525b69',
      );
      if (alt && wi >= 2) {
        for (let l = 1; l < 3; l++) {
          const l1 = p.x1 - p.w1 + ((2 * p.w1) / 3) * l;
          const l2 = p.x2 - p.w2 + ((2 * p.w2) / 3) * l;
          this.poly(l1 - p.w1 * 0.02, p.y1, l1 + p.w1 * 0.02, p.y1, l2 + p.w2 * 0.02, p.y2, l2 - p.w2 * 0.02, p.y2, '#f8fafc');
        }
      }
      // ต้นไม้ / ป้าย
      const dec = this.segs[wi].deco;
      const clipNeeded = p.clip < p.y1;
      if (clipNeeded) {
        c.save();
        c.beginPath();
        c.rect(0, 0, W, p.clip);
        c.clip();
      }
      if (dec !== 0 && dec !== 9) this.drawTree(p.x1 + p.w1 * dec, p.y1, p.s, Math.abs(dec) > 2);
      else if (dec === 9) {
        const h = p.s * 1800;
        const sx = p.x1 + p.w1 * 1.35;
        c.fillStyle = '#e2e8f0';
        c.fillRect(sx - h * 0.02, p.y1 - h, h * 0.04, h);
        c.fillStyle = '#f97316';
        c.fillRect(sx - h * 0.3, p.y1 - h * 1.15, h * 0.6, h * 0.35);
      }
      for (const car of this.cars) {
        if (Math.floor(car.z / SEG_L) !== wi) continue;
        const cw = p.s * 600;
        this.drawCar(p.x1 + p.w1 * car.offset, p.y1, cw, car.color, false);
      }
      if (clipNeeded) c.restore();
    }

    // รถผู้เล่น
    const bounce = Math.abs(this.playerX) > 1 && this.speed > 800 ? (Math.random() - 0.5) * 3 : 0;
    this.drawCar(W / 2 + this.steer * 5, 118 + bounce, (K / (NEAR + PLAYER_Z)) * 600, '#ef4444', this.brake > 0.2);
    if (this.shake > 0) {
      c.fillStyle = `rgba(239,68,68,${this.shake * 0.5})`;
      c.fillRect(-8, 0, W + 16, H);
    }
    c.restore();
    this.drawHud();
  }

  private drawHud() {
    const c = this.ctx;
    const W = CANVAS_W;
    const H = CANVAS_H;
    const mx = W / 2;
    const live = this.manual || this.speed > 1;
    // เวลา/รอบ (จอซ้าย)
    this.text(`LAP ${this.lap}`, 6, 12, 10, '#fde68a');
    this.text(fmtTime(this.lapTime), 6, 24, 10, '#f8fafc');
    if (this.bestLap > 0) this.text(`BEST ${fmtTime(this.bestLap)}`, 6, 35, 8, '#86efac');
    // โหมด (จอขวา)
    this.text(this.manual ? 'MANUAL' : live ? 'AUTOPILOT' : 'STANDBY', W - 6, 12, 10, this.manual ? '#fb7185' : '#7dd3fc', 'right');
    // เกียร์ + ความเร็ว + รอบเครื่อง (จอกลาง)
    const r = Math.min(1.05, this.speed / gearTopU(this.gear));
    const lim = this.limiter && Math.floor(this.clock * 12) % 2 === 0;
    this.text(String(this.gear), mx + 62, H - 12, 30, lim ? '#ef4444' : '#facc15', 'center');
    this.text('GEAR', mx + 62, H - 42, 7, '#cbd5e1', 'center');
    this.text(`${Math.round(this.speed * KMH)}`, mx - 62, H - 12, 22, '#f8fafc', 'center');
    this.text('KM/H', mx - 62, H - 36, 7, '#cbd5e1', 'center');
    const bx = mx - 80;
    const bw = 160;
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(bx, H - 6, bw, 4);
    c.fillStyle = r > 0.9 ? '#ef4444' : r > 0.7 ? '#facc15' : '#22c55e';
    c.fillRect(bx, H - 6, bw * Math.min(1, r), 4);
    // วิธีเล่น
    if (this.manual || this.hover) {
      c.fillStyle = 'rgba(2,6,23,0.72)';
      c.fillRect(mx - 92, 4, 184, 38);
      if (this.manual) {
        this.text('YOU ARE DRIVING', mx, 14, 9, '#fb7185', 'center');
        this.text('A/D ←/→ steer   W/↑ gas   S/↓ brake', mx, 25, 8, '#e2e8f0', 'center');
        this.text('Q gear down   E gear up   Esc exit', mx, 36, 8, '#e2e8f0', 'center');
      } else {
        const blink = Math.floor(performance.now() / 500) % 2 === 0;
        this.text('CLICK RIG TO DRIVE', mx, 15, 9, blink ? '#facc15' : '#fde68a', 'center');
        this.text('A/D steer  W gas  S brake', mx, 26, 8, '#e2e8f0', 'center');
        this.text('Q/E shift gear  Esc exit', mx, 36, 8, '#e2e8f0', 'center');
      }
    }
  }
}
