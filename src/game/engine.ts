import { soundEngine } from './audio';
import {
  ArenaConfig,
  Direction,
  FloatingText,
  GameState,
  HudStats,
  Particle,
  Point,
  Rat,
  RatKind,
  SwallowBulge,
} from './types';

export const DEFAULT_ARENA: ArenaConfig = {
  cols: 24,
  rows: 18,
  baseTickMs: 148,
  minTickMs: 60,
  baseRatTickMs: 560,
  minRatTickMs: 145,
};

const BEST_SCORE_KEY = 'verdant_fang_best_score';
const MAX_PARTICLES = 96;

const DIR_VECTORS: Record<Direction, Point> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

const OPPOSITE_DIR: Record<Direction, Direction> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
};

const ALL_DIRS: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

function loadBestScore(): number {
  try {
    const raw = localStorage.getItem(BEST_SCORE_KEY);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function saveBestScore(score: number): void {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // Ignore storage errors
  }
}

function cellHash(x: number, y: number): number {
  let n = (x * 374761393 + y * 668265263) ^ 0x5bf03635;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function dirToAngle(dir: Direction): number {
  switch (dir) {
    case 'RIGHT':
      return 0;
    case 'DOWN':
      return Math.PI / 2;
    case 'LEFT':
      return Math.PI;
    case 'UP':
      return -Math.PI / 2;
  }
}

export interface EngineCallbacks {
  onStatsChange: (stats: HudStats) => void;
  onGameOver: (stats: HudStats) => void;
}

export class SnakeGameEngine {
  private readonly config: ArenaConfig;
  private readonly callbacks: EngineCallbacks;

  private gameState: GameState = 'TITLE_MENU';
  private segments: Point[] = [];
  private prevSegments: Point[] = [];
  private direction: Direction = 'RIGHT';
  private turnQueue: Direction[] = [];
  private pendingGrowth: number = 0;
  private swallowBulges: SwallowBulge[] = [];

  private rats: Rat[] = [];
  private nextRatId: number = 1;

  private score: number = 0;
  private ratsEaten: number = 0;
  private goldenRatsEaten: number = 0;
  private bestScore: number = loadBestScore();
  private isNewRecord: boolean = false;
  private deathReason: 'WALL' | 'SELF' | null = null;

  private tickIntervalMs: number = DEFAULT_ARENA.baseTickMs;
  private tickAccumulatorMs: number = 0;
  private elapsedSeconds: number = 0;

  private hitstopSeconds: number = 0;
  private shakeIntensity: number = 0;
  private deathFlashTimer: number = 0;
  private deathRevealTimer: number = 0;
  private pendingGameOver: boolean = false;
  private impactPoint: Point | null = null;

  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];

  private tongueTimer: number = 0;
  private tongueActive: boolean = false;

  constructor(callbacks: EngineCallbacks, config: ArenaConfig = DEFAULT_ARENA) {
    this.callbacks = callbacks;
    this.config = config;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 2,
        color: '#22c55e',
        alpha: 1,
        life: 0,
        maxLife: 0.4,
      });
    }
    this.resetWorld();
  }

  public setState(state: GameState): void {
    this.gameState = state;
  }

  public getState(): GameState {
    return this.gameState;
  }

  public getStats(): HudStats {
    return {
      score: this.score,
      length: this.segments.length,
      speedMultiplier: this.getSpeedMultiplier(),
      ratSpeedMultiplier: this.getRatSpeedMultiplier(),
      ratsEaten: this.ratsEaten,
      goldenRatsEaten: this.goldenRatsEaten,
      bestScore: this.bestScore,
      isNewRecord: this.isNewRecord,
      deathReason: this.deathReason,
    };
  }

  public getSpeedMultiplier(): number {
    return Number((this.config.baseTickMs / this.tickIntervalMs).toFixed(2));
  }

  public getRatSpeedMultiplier(): number {
    const fieldInterval = this.computeRatIntervalMs('FIELD', this.ratsEaten);
    return Number((this.config.baseRatTickMs / fieldInterval).toFixed(2));
  }

  public resetWorld(): void {
    const startY = Math.floor(this.config.rows / 2);
    const startX = 6;
    this.segments = [
      { x: startX, y: startY },
      { x: startX - 1, y: startY },
      { x: startX - 2, y: startY },
      { x: startX - 3, y: startY },
    ];
    this.prevSegments = this.segments.map((s) => ({ ...s }));
    this.direction = 'RIGHT';
    this.turnQueue = [];
    this.pendingGrowth = 0;
    this.swallowBulges = [];
    this.rats = [];

    this.score = 0;
    this.ratsEaten = 0;
    this.goldenRatsEaten = 0;
    this.isNewRecord = false;
    this.deathReason = null;
    this.tickIntervalMs = this.config.baseTickMs;
    this.tickAccumulatorMs = 0;
    this.hitstopSeconds = 0;
    this.shakeIntensity = 0;
    this.deathFlashTimer = 0;
    this.deathRevealTimer = 0;
    this.pendingGameOver = false;
    this.impactPoint = null;
    this.floatingTexts = [];
    for (const p of this.particles) {
      p.active = false;
    }

    this.spawnRat('FIELD', { x: 16, y: startY });
    this.emitStats();
  }

  public startNewGame(): void {
    this.resetWorld();
    this.gameState = 'PLAYING';
  }

  public queueDirection(nextDir: Direction): void {
    if (this.gameState !== 'PLAYING' || this.pendingGameOver) return;

    const lastPlanned =
      this.turnQueue.length > 0 ? this.turnQueue[this.turnQueue.length - 1] : this.direction;

    if (nextDir === lastPlanned || nextDir === OPPOSITE_DIR[lastPlanned]) {
      return;
    }
    if (this.turnQueue.length < 2) {
      this.turnQueue.push(nextDir);
      soundEngine.playTurn();
    }
  }

  public clearInputQueue(): void {
    this.turnQueue = [];
  }

  private emitStats(): void {
    this.callbacks.onStatsChange(this.getStats());
  }

  private computeTickIntervalMs(ratsEaten: number): number {
    const span = this.config.baseTickMs - this.config.minTickMs;
    return Math.max(this.config.minTickMs, this.config.minTickMs + span * Math.exp(-0.048 * ratsEaten));
  }

  private computeRatIntervalMs(kind: RatKind, ratsEaten: number): number {
    const span = this.config.baseRatTickMs - this.config.minRatTickMs;
    const fieldMs = Math.max(
      this.config.minRatTickMs,
      this.config.minRatTickMs + span * Math.exp(-0.085 * ratsEaten)
    );
    return kind === 'GOLDEN' ? Math.max(115, fieldMs * 0.78) : fieldMs;
  }

  private isCellOccupiedBySnake(x: number, y: number, ignoreTailTip: boolean = false): boolean {
    const limit = ignoreTailTip ? this.segments.length - 1 : this.segments.length;
    for (let i = 0; i < limit; i++) {
      if (this.segments[i].x === x && this.segments[i].y === y) {
        return true;
      }
    }
    return false;
  }

  private isCellOccupiedByRat(x: number, y: number, excludeId?: number): boolean {
    return this.rats.some((r) => r.id !== excludeId && r.x === x && r.y === y);
  }

  private spawnRat(kind: RatKind, preferred?: Point): void {
    const head = this.segments[0];
    const headVec = DIR_VECTORS[this.direction];
    const candidates: Point[] = [];

    if (
      preferred &&
      preferred.x >= 0 &&
      preferred.x < this.config.cols &&
      preferred.y >= 0 &&
      preferred.y < this.config.rows &&
      !this.isCellOccupiedBySnake(preferred.x, preferred.y) &&
      !this.isCellOccupiedByRat(preferred.x, preferred.y)
    ) {
      candidates.push(preferred);
    } else {
      for (let y = 0; y < this.config.rows; y++) {
        for (let x = 0; x < this.config.cols; x++) {
          if (this.isCellOccupiedBySnake(x, y) || this.isCellOccupiedByRat(x, y)) continue;
          // Avoid spawning right inside the snake's nose path within 2 tiles
          const dx = x - head.x;
          const dy = y - head.y;
          const inFront =
            (dx === headVec.x && dy === headVec.y) ||
            (dx === headVec.x * 2 && dy === headVec.y * 2);
          if (inFront) continue;
          candidates.push({ x, y });
        }
      }
      // Fallback if board is nearly full
      if (candidates.length === 0) {
        for (let y = 0; y < this.config.rows; y++) {
          for (let x = 0; x < this.config.cols; x++) {
            if (!this.isCellOccupiedBySnake(x, y) && !this.isCellOccupiedByRat(x, y)) {
              candidates.push({ x, y });
            }
          }
        }
      }
    }

    if (candidates.length === 0) return;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    const facing = ALL_DIRS[Math.floor(Math.random() * ALL_DIRS.length)];
    const maxTtl = kind === 'GOLDEN' ? 8.5 : Infinity;

    this.rats.push({
      id: this.nextRatId++,
      kind,
      x: chosen.x,
      y: chosen.y,
      prevX: chosen.x,
      prevY: chosen.y,
      facing,
      hopProgress: 1,
      moveTimerMs: 0,
      ttl: maxTtl,
      maxTtl,
      wigglePhase: Math.random() * Math.PI * 2,
    });

    if (kind === 'GOLDEN') {
      soundEngine.playGoldenSpawn();
      this.spawnBurst(chosen.x + 0.5, chosen.y + 0.5, '#fbbf24', 10, 2.2);
    }
  }

  private spawnBurst(gridX: number, gridY: number, color: string, count: number, speed: number): void {
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        const angle = (Math.PI * 2 * spawned) / count + (Math.random() - 0.5) * 0.5;
        const mag = speed * (0.55 + Math.random() * 0.8);
        p.active = true;
        p.x = gridX;
        p.y = gridY;
        p.vx = Math.cos(angle) * mag;
        p.vy = Math.sin(angle) * mag;
        p.radius = 0.08 + Math.random() * 0.09;
        p.color = color;
        p.alpha = 1;
        p.life = 0;
        p.maxLife = 0.32 + Math.random() * 0.25;
        spawned++;
      }
    }
  }

  public update(rawDt: number): void {
    const dt = Math.min(rawDt, 0.05);
    this.elapsedSeconds += dt;

    // Tongue flick animation runs even gently on title screen
    this.tongueTimer += dt;
    if (this.tongueTimer > 1.8) {
      this.tongueActive = true;
      if (this.tongueTimer > 2.08) {
        this.tongueActive = false;
        this.tongueTimer = 0;
      }
    }

    // Update particles & floating text regardless of hitstop so impacts feel crisp
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.alpha = 1 - p.life / p.maxLife;
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life += dt;
      ft.y -= dt * 1.15;
      if (ft.life >= ft.maxLife) {
        this.floatingTexts.splice(i, 1);
      }
    }

    if (this.shakeIntensity > 0) {
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 28);
    }

    // Update rat hop interpolation & wiggle (scales briskly as rat speed increases)
    const ratSpeedScale = this.getRatSpeedMultiplier();
    for (const rat of this.rats) {
      rat.wigglePhase += dt * (7 + ratSpeedScale * 4);
      if (rat.hopProgress < 1) {
        const ratIntervalSec = this.computeRatIntervalMs(rat.kind, this.ratsEaten) / 1000;
        const hopDuration = Math.min(0.11, ratIntervalSec * 0.65);
        rat.hopProgress = Math.min(1, rat.hopProgress + dt / Math.max(0.04, hopDuration));
      }
    }

    if (this.gameState !== 'PLAYING') {
      return;
    }

    if (this.pendingGameOver) {
      this.deathFlashTimer = Math.max(0, this.deathFlashTimer - dt);
      this.deathRevealTimer -= dt;
      if (this.deathRevealTimer <= 0) {
        this.pendingGameOver = false;
        this.gameState = 'GAME_OVER';
        this.callbacks.onGameOver(this.getStats());
      }
      return;
    }

    if (this.hitstopSeconds > 0) {
      this.hitstopSeconds = Math.max(0, this.hitstopSeconds - dt);
      return;
    }

    // Update swallow bulges down the spine
    for (let i = this.swallowBulges.length - 1; i >= 0; i--) {
      this.swallowBulges[i].progress += dt * 1.65;
      if (this.swallowBulges[i].progress >= 1) {
        this.swallowBulges.splice(i, 1);
      }
    }

    // Golden rat TTL countdown & independent rat scurry movement
    for (let i = this.rats.length - 1; i >= 0; i--) {
      const rat = this.rats[i];
      if (rat.kind === 'GOLDEN') {
        rat.ttl -= dt;
        if (rat.ttl <= 0) {
          this.spawnBurst(rat.x + 0.5, rat.y + 0.5, '#a8a29e', 8, 1.5);
          this.rats.splice(i, 1);
          continue;
        }
      }

      const ratIntervalMs = this.computeRatIntervalMs(rat.kind, this.ratsEaten);
      rat.moveTimerMs += dt * 1000;
      if (rat.moveTimerMs >= ratIntervalMs) {
        rat.moveTimerMs -= ratIntervalMs;
        this.stepSingleRat(rat);
      }
    }

    this.tickAccumulatorMs += dt * 1000;
    while (this.tickAccumulatorMs >= this.tickIntervalMs) {
      this.tickAccumulatorMs -= this.tickIntervalMs;
      this.stepSimulationTick();
      if (this.pendingGameOver) {
        break;
      }
    }
  }

  private stepSimulationTick(): void {
    if (this.turnQueue.length > 0) {
      const next = this.turnQueue.shift()!;
      if (next !== OPPOSITE_DIR[this.direction]) {
        this.direction = next;
      }
    }

    const head = this.segments[0];
    const vec = DIR_VECTORS[this.direction];
    const nextHead: Point = { x: head.x + vec.x, y: head.y + vec.y };

    // Solid stone wall collision
    if (
      nextHead.x < 0 ||
      nextHead.x >= this.config.cols ||
      nextHead.y < 0 ||
      nextHead.y >= this.config.rows
    ) {
      this.triggerCollision('WALL', {
        x: Math.max(0, Math.min(this.config.cols - 1, nextHead.x)) + 0.5 + vec.x * 0.4,
        y: Math.max(0, Math.min(this.config.rows - 1, nextHead.y)) + 0.5 + vec.y * 0.4,
      });
      return;
    }

    // Check if snake will eat a rat on nextHead (to know whether tail vacates)
    const eatenIndex = this.rats.findIndex((r) => r.x === nextHead.x && r.y === nextHead.y);
    const willGrow = this.pendingGrowth > 0 || eatenIndex !== -1;

    // Self collision (tail tip is safe if not growing on this tick)
    if (this.isCellOccupiedBySnake(nextHead.x, nextHead.y, !willGrow)) {
      this.triggerCollision('SELF', { x: nextHead.x + 0.5, y: nextHead.y + 0.5 });
      return;
    }

    // Store previous positions for 60fps interpolation
    this.prevSegments = this.segments.map((s) => ({ ...s }));
    this.segments.unshift(nextHead);

    if (this.pendingGrowth > 0) {
      this.pendingGrowth--;
      const lastPrev = this.prevSegments[this.prevSegments.length - 1];
      this.prevSegments.push({ ...lastPrev });
    } else if (eatenIndex === -1) {
      this.segments.pop();
    } else {
      // Growing immediately on catch: duplicate last prevSegment so interpolation stays anchored
      const lastPrev = this.prevSegments[this.prevSegments.length - 1];
      this.prevSegments.push({ ...lastPrev });
    }

    // Handle eating rat
    if (eatenIndex !== -1) {
      const eatenRat = this.rats[eatenIndex];
      this.rats.splice(eatenIndex, 1);

      this.ratsEaten += 1;
      if (eatenRat.kind === 'GOLDEN') {
        this.goldenRatsEaten += 1;
      }

      // Update speed first so speedMultiplier reflects real-time acceleration
      this.tickIntervalMs = this.computeTickIntervalMs(this.ratsEaten);
      const speedMult = this.getSpeedMultiplier();

      const earnedPoints =
        eatenRat.kind === 'GOLDEN'
          ? 35 + Math.round((speedMult - 1) * 20)
          : 10 + Math.round((speedMult - 1) * 10);

      this.score += earnedPoints;
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        this.isNewRecord = true;
        saveBestScore(this.bestScore);
      }

      this.swallowBulges.push({ progress: 0.04 });
      this.hitstopSeconds = eatenRat.kind === 'GOLDEN' ? 0.045 : 0.028;
      this.shakeIntensity = eatenRat.kind === 'GOLDEN' ? 3.5 : 1.8;

      if (eatenRat.kind === 'GOLDEN') {
        soundEngine.playGoldenEat();
        this.spawnBurst(nextHead.x + 0.5, nextHead.y + 0.5, '#fbbf24', 18, 4.2);
        this.spawnBurst(nextHead.x + 0.5, nextHead.y + 0.5, '#fef08a', 8, 2.8);
        this.floatingTexts.push({
          x: nextHead.x + 0.5,
          y: nextHead.y + 0.15,
          text: `+${earnedPoints}`,
          color: '#fbbf24',
          life: 0,
          maxLife: 0.85,
        });
      } else {
        soundEngine.playEat(speedMult);
        this.spawnBurst(nextHead.x + 0.5, nextHead.y + 0.5, '#4ade80', 10, 3.0);
        this.spawnBurst(nextHead.x + 0.5, nextHead.y + 0.5, '#d6be9f', 6, 2.1);
        this.floatingTexts.push({
          x: nextHead.x + 0.5,
          y: nextHead.y + 0.15,
          text: `+${earnedPoints}`,
          color: '#a7f3d0',
          life: 0,
          maxLife: 0.72,
        });
      }

      // Ensure a field rat is always present
      const hasFieldRat = this.rats.some((r) => r.kind === 'FIELD');
      if (!hasFieldRat) {
        this.spawnRat('FIELD');
      }

      // Spawn a Golden Bonus Rat every 5 catches if none active
      if (eatenRat.kind === 'FIELD' && this.ratsEaten % 5 === 0) {
        const hasGolden = this.rats.some((r) => r.kind === 'GOLDEN');
        if (!hasGolden) {
          this.spawnRat('GOLDEN');
        }
      }

      this.emitStats();
    }
  }

  private stepSingleRat(rat: Rat): void {
    const head = this.segments[0];
    const headVec = DIR_VECTORS[this.direction];
    const snakeNextTile = { x: head.x + headVec.x, y: head.y + headVec.y };

    const validDirs = ALL_DIRS.filter((d) => {
      const v = DIR_VECTORS[d];
      const nx = rat.x + v.x;
      const ny = rat.y + v.y;
      if (nx < 0 || nx >= this.config.cols || ny < 0 || ny >= this.config.rows) return false;
      if (this.isCellOccupiedBySnake(nx, ny)) return false;
      if (this.isCellOccupiedByRat(nx, ny, rat.id)) return false;
      // Avoid stepping straight onto the snake's immediate upcoming bite tile
      if (nx === snakeNextTile.x && ny === snakeNextTile.y) return false;
      return true;
    });

    if (validDirs.length === 0) return;

    // Prefer continuing in current direction or turning gently rather than reversing
    let chosenDir: Direction;
    const forwardValid = validDirs.includes(rat.facing);
    if (forwardValid && Math.random() < 0.55) {
      chosenDir = rat.facing;
    } else {
      const nonReverse = validDirs.filter((d) => d !== OPPOSITE_DIR[rat.facing]);
      const pool = nonReverse.length > 0 ? nonReverse : validDirs;
      chosenDir = pool[Math.floor(Math.random() * pool.length)];
    }

    const moveVec = DIR_VECTORS[chosenDir];
    rat.prevX = rat.x;
    rat.prevY = rat.y;
    rat.x += moveVec.x;
    rat.y += moveVec.y;
    rat.facing = chosenDir;
    rat.hopProgress = 0;
  }

  private triggerCollision(reason: 'WALL' | 'SELF', impact: Point): void {
    this.deathReason = reason;
    this.impactPoint = impact;
    this.pendingGameOver = true;
    this.deathFlashTimer = 0.22;
    this.deathRevealTimer = 0.24;
    this.shakeIntensity = 9;
    this.tickAccumulatorMs = 0;
    soundEngine.playCrash();

    this.spawnBurst(impact.x, impact.y, reason === 'WALL' ? '#cbd5e1' : '#f87171', 16, 4.4);
    this.spawnBurst(impact.x, impact.y, '#22c55e', 8, 2.8);
    this.emitStats();
  }

  public render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.clearRect(0, 0, width, height);

    const wallPadCells = 1; // 1 cell carved limestone wall border around arena
    const totalCols = this.config.cols + wallPadCells * 2;
    const totalRows = this.config.rows + wallPadCells * 2;

    const cellSize = Math.floor(Math.min(width / totalCols, height / totalRows));
    const boardW = totalCols * cellSize;
    const boardH = totalRows * cellSize;
    const originX = Math.floor((width - boardW) / 2);
    const originY = Math.floor((height - boardH) / 2);

    const shakeX = this.shakeIntensity > 0 ? (Math.random() - 0.5) * this.shakeIntensity * 1.4 : 0;
    const shakeY = this.shakeIntensity > 0 ? (Math.random() - 0.5) * this.shakeIntensity * 1.4 : 0;

    ctx.save();
    ctx.translate(originX + shakeX, originY + shakeY);

    // Outer ambient shadow around the carved stone terrarium
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#1b261e';
    ctx.beginPath();
    ctx.roundRect(0, 0, boardW, boardH, Math.max(8, cellSize * 0.45));
    ctx.fill();
    ctx.restore();

    const playX = wallPadCells * cellSize;
    const playY = wallPadCells * cellSize;
    const playW = this.config.cols * cellSize;
    const playH = this.config.rows * cellSize;

    // Draw carved stone border walls
    this.drawStoneWalls(ctx, cellSize, totalCols, totalRows);

    // Clip interior arena floor
    ctx.save();
    ctx.beginPath();
    ctx.rect(playX, playY, playW, playH);
    ctx.clip();

    // Draw mossy stone floor tiles
    this.drawArenaFloor(ctx, playX, playY, cellSize);

    // Translate to interior playfield coordinates
    ctx.translate(playX, playY);

    // Draw rats
    for (const rat of this.rats) {
      this.drawRat(ctx, rat, cellSize);
    }

    // Draw interpolated serpent
    const interpAlpha =
      this.gameState === 'PLAYING' && !this.pendingGameOver
        ? Math.min(1, this.tickAccumulatorMs / this.tickIntervalMs)
        : 1;
    this.drawSnake(ctx, cellSize, interpAlpha);

    // Draw particles
    for (const p of this.particles) {
      if (!p.active) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x * cellSize, p.y * cellSize, p.radius * cellSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw floating score popups
    for (const ft of this.floatingTexts) {
      const progress = ft.life / ft.maxLife;
      const alpha = progress < 0.2 ? progress / 0.2 : 1 - (progress - 0.2) / 0.8;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = `700 ${Math.max(12, Math.round(cellSize * 0.54))}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillText(ft.text, ft.x * cellSize + 1, ft.y * cellSize + 1.5);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x * cellSize, ft.y * cellSize);
      ctx.restore();
    }

    // Impact ring on collision
    if (this.impactPoint && (this.pendingGameOver || this.gameState === 'GAME_OVER')) {
      ctx.save();
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.85)';
      ctx.lineWidth = Math.max(2, cellSize * 0.1);
      ctx.beginPath();
      ctx.arc(
        this.impactPoint.x * cellSize,
        this.impactPoint.y * cellSize,
        cellSize * (0.55 + (1 - this.deathFlashTimer / 0.22) * 0.35),
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // End playfield clip

    // Subtle recessed inner shadow along stone wall rim
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = Math.max(2, cellSize * 0.12);
    ctx.strokeRect(playX, playY, playW, playH);

    ctx.restore();
  }

  private drawStoneWalls(
    ctx: CanvasRenderingContext2D,
    cell: number,
    totalCols: number,
    totalRows: number
  ): void {
    const outerRadius = Math.max(8, cell * 0.45);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, totalCols * cell, totalRows * cell, outerRadius);
    ctx.clip();

    // Base stone mortar
    ctx.fillStyle = '#1b241e';
    ctx.fillRect(0, 0, totalCols * cell, totalRows * cell);

    for (let r = 0; r < totalRows; r++) {
      for (let c = 0; c < totalCols; c++) {
        const isBorder = r === 0 || r === totalRows - 1 || c === 0 || c === totalCols - 1;
        if (!isBorder) continue;

        const h = cellHash(c + 100, r + 200);
        const x = c * cell;
        const y = r * cell;
        const gap = Math.max(1.2, cell * 0.06);

        // Carved limestone block
        const shade = Math.round(44 + h * 14);
        ctx.fillStyle = `rgb(${shade}, ${shade + 12}, ${shade + 4})`;
        ctx.beginPath();
        ctx.roundRect(x + gap, y + gap, cell - gap * 2, cell - gap * 2, cell * 0.14);
        ctx.fill();

        // Top bevel highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(x + gap + 2, y + gap + 1, cell - gap * 2 - 4, Math.max(1.5, cell * 0.08));

        // Moss tuft on select stone blocks
        if (h > 0.62) {
          ctx.fillStyle = h > 0.82 ? 'rgba(74, 222, 128, 0.28)' : 'rgba(34, 197, 94, 0.22)';
          ctx.beginPath();
          ctx.arc(x + cell * (0.28 + (h - 0.62) * 1.1), y + cell * 0.72, cell * 0.22, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  private drawArenaFloor(
    ctx: CanvasRenderingContext2D,
    playX: number,
    playY: number,
    cell: number
  ): void {
    for (let y = 0; y < this.config.rows; y++) {
      for (let x = 0; x < this.config.cols; x++) {
        const even = (x + y) % 2 === 0;
        const px = playX + x * cell;
        const py = playY + y * cell;
        ctx.fillStyle = even ? '#141f18' : '#17241c';
        ctx.fillRect(px, py, cell, cell);

        const h = cellHash(x, y);
        if (h > 0.84) {
          // Subtle moss speck
          ctx.fillStyle = 'rgba(74, 222, 128, 0.07)';
          ctx.beginPath();
          ctx.arc(px + cell * (0.25 + (h - 0.84) * 3), py + cell * 0.65, cell * 0.14, 0, Math.PI * 2);
          ctx.fill();
        } else if (h < 0.1) {
          // Tiny damp stone pebble
          ctx.fillStyle = 'rgba(148, 163, 184, 0.06)';
          ctx.beginPath();
          ctx.arc(px + cell * 0.7, py + cell * 0.35, cell * 0.08, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  private drawRat(ctx: CanvasRenderingContext2D, rat: Rat, cell: number): void {
    const t = rat.hopProgress;
    // Ease out quad for crisp scurry hop
    const eased = 1 - (1 - t) * (1 - t);
    const ix = rat.prevX + (rat.x - rat.prevX) * eased;
    const iy = rat.prevY + (rat.y - rat.prevY) * eased;

    const hopArc = t < 1 ? Math.sin(t * Math.PI) * cell * 0.14 : 0;
    const cx = (ix + 0.5) * cell;
    const cy = (iy + 0.5) * cell - hopArc;

    const isGolden = rat.kind === 'GOLDEN';
    const angle = dirToAngle(rat.facing);

    // Golden rat countdown halo & warm glow
    if (isGolden) {
      const ratio = Math.max(0, rat.ttl / rat.maxTtl);
      const pulse = 0.85 + Math.sin(this.elapsedSeconds * 7) * 0.15;

      const glow = ctx.createRadialGradient(cx, cy, cell * 0.1, cx, cy, cell * 0.75);
      glow.addColorStop(0, `rgba(251, 191, 36, ${0.34 * pulse})`);
      glow.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.75, 0, Math.PI * 2);
      ctx.fill();

      // Shrinking timer arc
      ctx.save();
      ctx.strokeStyle = ratio < 0.3 ? 'rgba(248, 113, 113, 0.85)' : 'rgba(251, 191, 36, 0.72)';
      ctx.lineWidth = Math.max(1.8, cell * 0.08);
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.48, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
      ctx.stroke();
      ctx.restore();
    }

    // Ground contact shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.beginPath();
    ctx.ellipse(
      (ix + 0.5) * cell,
      (iy + 0.58) * cell,
      cell * 0.32,
      cell * 0.18,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // Sinuous pink tail trailing behind (-x direction)
    const tailWag = Math.sin(rat.wigglePhase) * cell * 0.1;
    ctx.strokeStyle = isGolden ? '#fde68a' : '#e2a3a8';
    ctx.lineWidth = Math.max(1.5, cell * 0.08);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-cell * 0.24, 0);
    ctx.quadraticCurveTo(-cell * 0.44, tailWag, -cell * 0.58, -tailWag * 0.65);
    ctx.stroke();

    // Plump rat body
    ctx.fillStyle = isGolden ? '#f59e0b' : '#b89b7a';
    ctx.beginPath();
    ctx.ellipse(-cell * 0.03, 0, cell * 0.29, cell * 0.21, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dorsal fur highlight
    ctx.fillStyle = isGolden ? '#fde047' : '#d6be9f';
    ctx.beginPath();
    ctx.ellipse(0, -cell * 0.03, cell * 0.18, cell * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pointed snout (+x direction)
    ctx.fillStyle = isGolden ? '#fbbf24' : '#c9ae8f';
    ctx.beginPath();
    ctx.ellipse(cell * 0.22, 0, cell * 0.15, cell * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rounded ears
    const earColor = isGolden ? '#fef08a' : '#e5b3b7';
    const earRim = isGolden ? '#d97706' : '#8c7258';
    for (const side of [-1, 1]) {
      ctx.fillStyle = earRim;
      ctx.beginPath();
      ctx.arc(cell * 0.09, side * cell * 0.15, cell * 0.085, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = earColor;
      ctx.beginPath();
      ctx.arc(cell * 0.09, side * cell * 0.15, cell * 0.052, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dark beady eyes
    ctx.fillStyle = '#0f172a';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cell * 0.22, side * cell * 0.075, Math.max(1.2, cell * 0.042), 0, Math.PI * 2);
      ctx.fill();
    }

    // Pink nose tip
    ctx.fillStyle = isGolden ? '#fffbeb' : '#f472b6';
    ctx.beginPath();
    ctx.arc(cell * 0.35, 0, Math.max(1.2, cell * 0.045), 0, Math.PI * 2);
    ctx.fill();

    // Delicate whiskers
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = Math.max(0.8, cell * 0.03);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cell * 0.29, side * cell * 0.04);
      ctx.lineTo(cell * 0.4, side * cell * 0.16);
      ctx.moveTo(cell * 0.28, side * cell * 0.06);
      ctx.lineTo(cell * 0.36, side * cell * 0.2);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawSnake(ctx: CanvasRenderingContext2D, cell: number, alpha: number): void {
    const count = this.segments.length;
    if (count === 0) return;

    const points: Point[] = [];
    for (let i = 0; i < count; i++) {
      const curr = this.segments[i];
      const prev = this.prevSegments[i] ?? curr;
      points.push({
        x: (prev.x + (curr.x - prev.x) * alpha + 0.5) * cell,
        y: (prev.y + (curr.y - prev.y) * alpha + 0.5) * cell,
      });
    }

    // Draw subtle drop shadow under snake spine
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = cell * 0.72;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y + cell * 0.09);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y + cell * 0.09);
    }
    ctx.stroke();
    ctx.restore();

    // Draw connected body segments from tail to head so scales layer naturally
    for (let i = count - 1; i >= 1; i--) {
      const tNorm = i / Math.max(1, count - 1); // 0 at head, 1 at tail
      let radius = cell * (0.39 - tNorm * 0.18);

      // Apply digestive swallow bulge ripple
      for (const bulge of this.swallowBulges) {
        const dist = Math.abs(tNorm - bulge.progress);
        if (dist < 0.16) {
          radius += cell * 0.12 * Math.cos((dist / 0.16) * (Math.PI / 2));
        }
      }

      const pCurr = points[i];
      const pPrev = points[i - 1];

      // Bridge capsule between consecutive points for seamless organic spine
      const r = Math.round(21 + (1 - tNorm) * 18);
      const g = Math.round(128 + (1 - tNorm) * 72);
      const b = Math.round(61 + (1 - tNorm) * 34);
      const bodyColor = `rgb(${r}, ${g}, ${b})`;

      ctx.strokeStyle = bodyColor;
      ctx.lineWidth = radius * 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pCurr.x, pCurr.y);
      ctx.lineTo(pPrev.x, pPrev.y);
      ctx.stroke();

      // Subtle dorsal scale diamond pattern every 2 segments
      if (i % 2 === 1) {
        const segAngle = Math.atan2(pPrev.y - pCurr.y, pPrev.x - pCurr.x);
        ctx.save();
        ctx.translate(pCurr.x, pCurr.y);
        ctx.rotate(segAngle);
        ctx.fillStyle = 'rgba(134, 239, 172, 0.25)';
        ctx.beginPath();
        ctx.moveTo(radius * 0.45, 0);
        ctx.lineTo(0, radius * 0.36);
        ctx.lineTo(-radius * 0.45, 0);
        ctx.lineTo(0, -radius * 0.36);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // Draw sculpted Serpent Head
    const headPt = points[0];
    const headAngle = dirToAngle(this.direction);

    ctx.save();
    ctx.translate(headPt.x, headPt.y);
    ctx.rotate(headAngle);

    // Forked crimson tongue flicking periodically or when near prey
    const nearRat = this.rats.some(
      (r) => Math.abs(r.x - this.segments[0].x) + Math.abs(r.y - this.segments[0].y) <= 3
    );
    if (this.tongueActive || (nearRat && Math.sin(this.elapsedSeconds * 16) > 0.2)) {
      const flickLen = cell * (0.36 + Math.sin(this.elapsedSeconds * 28) * 0.08);
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = Math.max(1.4, cell * 0.065);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cell * 0.32, 0);
      ctx.lineTo(cell * 0.32 + flickLen, 0);
      ctx.moveTo(cell * 0.32 + flickLen * 0.72, 0);
      ctx.lineTo(cell * 0.32 + flickLen * 1.05, -cell * 0.11);
      ctx.moveTo(cell * 0.32 + flickLen * 0.72, 0);
      ctx.lineTo(cell * 0.32 + flickLen * 1.05, cell * 0.11);
      ctx.stroke();
    }

    // Head silhouette
    ctx.fillStyle = this.pendingGameOver ? '#ef4444' : '#22c55e';
    ctx.beginPath();
    ctx.ellipse(cell * 0.04, 0, cell * 0.44, cell * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();

    // Subtle brow highlight
    ctx.fillStyle = 'rgba(187, 247, 208, 0.35)';
    ctx.beginPath();
    ctx.ellipse(cell * 0.08, -cell * 0.08, cell * 0.22, cell * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    // Golden-amber eyes with dark vertical slit pupils
    for (const side of [-1, 1]) {
      const ex = cell * 0.15;
      const ey = side * cell * 0.18;
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(ex, ey, cell * 0.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#090d0a';
      ctx.beginPath();
      ctx.ellipse(ex + cell * 0.02, ey, cell * 0.032, cell * 0.068, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
