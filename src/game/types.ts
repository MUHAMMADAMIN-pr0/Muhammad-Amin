export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface Point {
  x: number;
  y: number;
}

export type RatKind = 'FIELD' | 'GOLDEN';

export interface Rat {
  id: number;
  kind: RatKind;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  facing: Direction;
  hopProgress: number;
  moveTimerMs: number;
  ttl: number;
  maxTtl: number;
  wigglePhase: number;
}

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface SwallowBulge {
  progress: number;
}

export interface HudStats {
  score: number;
  length: number;
  speedMultiplier: number;
  ratSpeedMultiplier: number;
  ratsEaten: number;
  goldenRatsEaten: number;
  bestScore: number;
  isNewRecord: boolean;
  deathReason: 'WALL' | 'SELF' | null;
}

export interface ArenaConfig {
  cols: number;
  rows: number;
  baseTickMs: number;
  minTickMs: number;
  baseRatTickMs: number;
  minRatTickMs: number;
}
