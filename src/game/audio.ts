class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor() {
    try {
      const saved = localStorage.getItem('verdant_fang_muted');
      if (saved === 'true') {
        this.muted = true;
      }
    } catch {
      // Ignore storage access errors
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem('verdant_fang_muted', String(muted));
    } catch {
      // Ignore storage access errors
    }
  }

  public unlock(): void {
    this.ensureContext();
  }

  public playTurn(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.028);
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.032);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.035);
  }

  public playEat(speedMultiplier: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const pitchScale = Math.min(1.35, 0.95 + (speedMultiplier - 1) * 0.18);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340 * pitchScale, now);
    osc.frequency.exponentialRampToValueAtTime(590 * pitchScale, now + 0.075);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);

    const pop = ctx.createOscillator();
    const popGain = ctx.createGain();
    pop.type = 'triangle';
    pop.frequency.setValueAtTime(760 * pitchScale, now + 0.03);
    pop.frequency.exponentialRampToValueAtTime(980 * pitchScale, now + 0.09);
    popGain.gain.setValueAtTime(0.07, now + 0.03);
    popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    pop.connect(popGain);
    popGain.connect(ctx.destination);
    pop.start(now + 0.03);
    pop.stop(now + 0.12);
  }

  public playGoldenEat(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.045;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.1, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  }

  public playGoldenSpawn(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.09);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playCrash(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = 'sawtooth';
    thud.frequency.setValueAtTime(145, now);
    thud.frequency.exponentialRampToValueAtTime(42, now + 0.26);
    thudGain.gain.setValueAtTime(0.18, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    thud.connect(thudGain);
    thudGain.connect(ctx.destination);
    thud.start(now);
    thud.stop(now + 0.3);

    const low = ctx.createOscillator();
    const lowGain = ctx.createGain();
    low.type = 'sine';
    low.frequency.setValueAtTime(95, now);
    low.frequency.exponentialRampToValueAtTime(34, now + 0.32);
    lowGain.gain.setValueAtTime(0.22, now);
    lowGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    low.connect(lowGain);
    lowGain.connect(ctx.destination);
    low.start(now);
    low.stop(now + 0.35);
  }
}

export const soundEngine = new SoundEngine();
