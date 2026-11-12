import * as THREE from 'three';

/**
 * มินิเกมที่มี AI เล่นเอง วาดลง 2D canvas เล็ก ๆ → CanvasTexture ของจอตู้เกม/ทีวี
 * อัปเดตเฉพาะตอนมี Agent เล่นอยู่ (~30fps) ไม่เล่น = attract screen นิ่ง ๆ
 */
export type GameKind = 'pong' | 'snake' | 'invaders';

interface MiniGame {
  step(dt: number): void;
  draw(c: CanvasRenderingContext2D, w: number, h: number): void;
}

const STEP = 1 / 30;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ---------------- Pong (AI vs AI) ----------------
class Pong implements MiniGame {
  private bx = 0.5;
  private by = 0.5;
  private vx = 0.55;
  private vy = 0.3;
  private p1 = 0.5;
  private p2 = 0.5;
  private s1 = 0;
  private s2 = 0;
  step(dt: number) {
    this.bx += this.vx * dt;
    this.by += this.vy * dt;
    if (this.by < 0.03 || this.by > 0.97) {
      this.vy = -this.vy;
      this.by = Math.min(0.97, Math.max(0.03, this.by));
    }
    // AI: ตามลูกด้วยความเร็วจำกัด (+ ผิดพลาดบ้าง)
    const sp = 0.5 * dt;
    const track = (p: number, err: number) => p + Math.max(-sp, Math.min(sp, this.by + err - p));
    this.p1 = track(this.p1, Math.sin(this.bx * 7) * 0.05);
    this.p2 = track(this.p2, Math.cos(this.bx * 5) * 0.06);
    if (this.bx < 0.05 && this.vx < 0) {
      if (Math.abs(this.by - this.p1) < 0.1) this.vx = -this.vx * 1.04;
      else if (this.bx < 0) this.reset(1);
    } else if (this.bx > 0.95 && this.vx > 0) {
      if (Math.abs(this.by - this.p2) < 0.1) this.vx = -this.vx * 1.04;
      else if (this.bx > 1) this.reset(-1);
    }
  }
  private reset(dir: number) {
    if (dir > 0) this.s2++;
    else this.s1++;
    this.bx = 0.5;
    this.by = rnd(0.3, 0.7);
    this.vx = 0.55 * dir;
    this.vy = rnd(-0.4, 0.4);
  }
  draw(c: CanvasRenderingContext2D, w: number, h: number) {
    c.fillStyle = '#020617';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#334155';
    for (let y = 4; y < h; y += 12) c.fillRect(w / 2 - 1, y, 2, 6);
    c.fillStyle = '#e2e8f0';
    c.fillRect(6, this.p1 * h - 12, 4, 24);
    c.fillRect(w - 10, this.p2 * h - 12, 4, 24);
    c.fillRect(this.bx * w - 3, this.by * h - 3, 6, 6);
    c.font = 'bold 16px monospace';
    c.textAlign = 'center';
    c.fillText(String(this.s1 % 10), w * 0.35, 20);
    c.fillText(String(this.s2 % 10), w * 0.65, 20);
  }
}

// ---------------- Snake (AI ไล่กินอาหาร) ----------------
const GRID = 16;
class Snake implements MiniGame {
  private body: [number, number][] = [];
  private dir: [number, number] = [1, 0];
  private food: [number, number] = [8, 8];
  private acc = 0;
  constructor() {
    this.reset();
  }
  private reset() {
    this.body = [[4, 8], [3, 8], [2, 8]];
    this.dir = [1, 0];
    this.placeFood();
  }
  private hit(x: number, y: number) {
    return x < 0 || y < 0 || x >= GRID || y >= GRID || this.body.some((b) => b[0] === x && b[1] === y);
  }
  private placeFood() {
    for (let k = 0; k < 50; k++) {
      const f: [number, number] = [Math.floor(rnd(0, GRID)), Math.floor(rnd(0, GRID))];
      if (!this.hit(f[0], f[1])) {
        this.food = f;
        return;
      }
    }
  }
  step(dt: number) {
    this.acc += dt;
    if (this.acc < 0.1) return;
    this.acc = 0;
    const [hx, hy] = this.body[0];
    // เลือกทิศที่ไม่ชน และใกล้อาหารที่สุด
    const dirs: [number, number][] = [this.dir, [this.dir[1], -this.dir[0]], [-this.dir[1], this.dir[0]]];
    let best = dirs[0];
    let bestD = Infinity;
    for (const d of dirs) {
      const nx = hx + d[0];
      const ny = hy + d[1];
      if (this.hit(nx, ny)) continue;
      const dist = Math.abs(nx - this.food[0]) + Math.abs(ny - this.food[1]);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    if (bestD === Infinity) {
      this.reset();
      return;
    }
    this.dir = best;
    const nx = hx + best[0];
    const ny = hy + best[1];
    this.body.unshift([nx, ny]);
    if (nx === this.food[0] && ny === this.food[1]) this.placeFood();
    else this.body.pop();
  }
  draw(c: CanvasRenderingContext2D, w: number, h: number) {
    c.fillStyle = '#052e16';
    c.fillRect(0, 0, w, h);
    const cw = w / GRID;
    const ch = h / GRID;
    c.fillStyle = '#ef4444';
    c.fillRect(this.food[0] * cw + 1, this.food[1] * ch + 1, cw - 2, ch - 2);
    this.body.forEach((b, i) => {
      c.fillStyle = i === 0 ? '#bef264' : '#4ade80';
      c.fillRect(b[0] * cw + 1, b[1] * ch + 1, cw - 2, ch - 2);
    });
    c.fillStyle = '#86efac';
    c.font = 'bold 10px monospace';
    c.textAlign = 'left';
    c.fillText(`SCORE ${(this.body.length - 3) * 10}`, 4, 11);
  }
}

// ---------------- Space Invaders mini (ยานยิงเอง) ----------------
class Invaders implements MiniGame {
  private ex = 0;
  private edir = 1;
  private ey = 0.12;
  private alive: boolean[] = [];
  private px = 0.5;
  private shots: [number, number][] = [];
  private cd = 0;
  private t = 0;
  constructor() {
    this.reset();
  }
  private reset() {
    this.alive = new Array(30).fill(true);
    this.ex = 0;
    this.ey = 0.12;
    this.shots = [];
  }
  private pos(i: number): [number, number] {
    return [0.12 + this.ex + (i % 10) * 0.075, this.ey + Math.floor(i / 10) * 0.12];
  }
  step(dt: number) {
    this.t += dt;
    this.ex += this.edir * 0.08 * dt;
    if (this.ex > 0.1 || this.ex < -0.1) {
      this.edir = -this.edir;
      this.ey += 0.03;
    }
    // ยานเล็งแถวหน้าสุดที่ใกล้ที่สุด แล้วยิง
    let tgt = -1;
    let bd = Infinity;
    this.alive.forEach((a, i) => {
      if (!a) return;
      const d = Math.abs(this.pos(i)[0] - this.px);
      if (d < bd) {
        bd = d;
        tgt = i;
      }
    });
    if (tgt >= 0) {
      const tx = this.pos(tgt)[0];
      this.px += Math.max(-0.4 * dt, Math.min(0.4 * dt, tx - this.px));
      this.cd -= dt;
      if (this.cd <= 0 && Math.abs(tx - this.px) < 0.02) {
        this.shots.push([this.px, 0.88]);
        this.cd = 0.45;
      }
    }
    for (const s of this.shots) s[1] -= 1.1 * dt;
    this.shots = this.shots.filter((s) => {
      if (s[1] < 0) return false;
      for (let i = this.alive.length - 1; i >= 0; i--) {
        if (!this.alive[i]) continue;
        const [x, y] = this.pos(i);
        if (Math.abs(s[0] - x) < 0.035 && Math.abs(s[1] - y) < 0.05) {
          this.alive[i] = false;
          return false;
        }
      }
      return true;
    });
    if (this.alive.every((a) => !a) || this.ey > 0.6) this.reset();
  }
  draw(c: CanvasRenderingContext2D, w: number, h: number) {
    c.fillStyle = '#020617';
    c.fillRect(0, 0, w, h);
    const wob = Math.floor(this.t * 3) % 2;
    this.alive.forEach((a, i) => {
      if (!a) return;
      const [x, y] = this.pos(i);
      c.fillStyle = ['#f472b6', '#a78bfa', '#38bdf8'][Math.floor(i / 10)];
      c.fillRect(x * w - 6, y * h - 4, 12, 8);
      c.fillRect(x * w - 8 + wob * 2, y * h + 2, 4, 3);
      c.fillRect(x * w + 4 - wob * 2, y * h + 2, 4, 3);
    });
    c.fillStyle = '#4ade80';
    c.fillRect(this.px * w - 8, h * 0.9, 16, 5);
    c.fillRect(this.px * w - 2, h * 0.9 - 4, 4, 4);
    c.fillStyle = '#fde047';
    for (const s of this.shots) c.fillRect(s[0] * w - 1, s[1] * h, 2, 6);
  }
}

const TITLES: Record<GameKind, string> = { pong: 'PONG', snake: 'SNAKE', invaders: 'INVADERS' };

export interface GameScreen {
  texture: THREE.CanvasTexture;
  /** เรียกทุกเฟรม: playing=true → เดินเกม ~30fps · false → attract screen นิ่ง ๆ */
  tick(dt: number, playing: boolean): void;
  dispose(): void;
}

export function createGameScreen(kind: GameKind, w: number, h: number): GameScreen {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d') as CanvasRenderingContext2D;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const game: MiniGame = kind === 'pong' ? new Pong() : kind === 'snake' ? new Snake() : new Invaders();
  let acc = 0;
  let attract = false;

  const drawAttract = () => {
    game.draw(c, w, h);
    c.fillStyle = 'rgba(2,6,23,0.72)';
    c.fillRect(0, 0, w, h);
    c.textAlign = 'center';
    c.font = `bold ${Math.round(h / 7)}px monospace`;
    c.fillStyle = '#facc15';
    c.fillText(TITLES[kind], w / 2, h * 0.45);
    c.font = `bold ${Math.round(h / 11)}px monospace`;
    c.fillStyle = '#e2e8f0';
    c.fillText('INSERT COIN', w / 2, h * 0.66);
    texture.needsUpdate = true;
  };
  drawAttract();
  attract = true;

  return {
    texture,
    tick(dt, playing) {
      if (!playing) {
        if (!attract) {
          drawAttract();
          attract = true;
        }
        return;
      }
      attract = false;
      acc += Math.min(dt, 0.1);
      if (acc < STEP) return;
      while (acc >= STEP) {
        game.step(STEP);
        acc -= STEP;
      }
      game.draw(c, w, h);
      texture.needsUpdate = true;
    },
    dispose() {
      texture.dispose();
    },
  };
}
