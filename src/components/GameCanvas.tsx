import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { SnakeGameEngine } from '../game/engine';
import { Direction, GameState, HudStats } from '../game/types';

export interface GameCanvasHandle {
  startNewGame: () => void;
  setGameState: (state: GameState) => void;
  queueDirection: (dir: Direction) => void;
  clearInputQueue: () => void;
}

interface GameCanvasProps {
  onStatsChange: (stats: HudStats) => void;
  onGameOver: (stats: HudStats) => void;
}

export const GameCanvas = forwardRef<GameCanvasHandle, GameCanvasProps>(
  ({ onStatsChange, onGameOver }, ref) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const engineRef = useRef<SnakeGameEngine | null>(null);
    const callbacksRef = useRef({ onStatsChange, onGameOver });
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);

    callbacksRef.current = { onStatsChange, onGameOver };

    useImperativeHandle(ref, () => ({
      startNewGame: () => engineRef.current?.startNewGame(),
      setGameState: (state: GameState) => engineRef.current?.setState(state),
      queueDirection: (dir: Direction) => engineRef.current?.queueDirection(dir),
      clearInputQueue: () => engineRef.current?.clearInputQueue(),
    }));

    useEffect(() => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const engine = new SnakeGameEngine({
        onStatsChange: (stats) => callbacksRef.current.onStatsChange(stats),
        onGameOver: (stats) => callbacksRef.current.onGameOver(stats),
      });
      engineRef.current = engine;

      let width = container.clientWidth;
      let height = container.clientHeight;

      const syncCanvasSize = () => {
        if (!container || !canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = Math.max(1, container.clientWidth);
        height = Math.max(1, container.clientHeight);
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };

      syncCanvasSize();
      const resizeObserver = new ResizeObserver(syncCanvasSize);
      resizeObserver.observe(container);

      let rafId = 0;
      let lastTime = performance.now();

      const loop = (now: number) => {
        const dt = (now - lastTime) / 1000;
        lastTime = now;
        engine.update(dt);
        engine.render(ctx, width, height);
        rafId = requestAnimationFrame(loop);
      };

      rafId = requestAnimationFrame(loop);

      return () => {
        cancelAnimationFrame(rafId);
        resizeObserver.disconnect();
        engineRef.current = null;
      };
    }, []);

    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 0) return;
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
      if (!touchStartRef.current || e.touches.length === 0) return;
      const dx = e.touches[0].clientX - touchStartRef.current.x;
      const dy = e.touches[0].clientY - touchStartRef.current.y;
      const threshold = 22;

      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

      if (Math.abs(dx) > Math.abs(dy)) {
        engineRef.current?.queueDirection(dx > 0 ? 'RIGHT' : 'LEFT');
      } else {
        engineRef.current?.queueDirection(dy > 0 ? 'DOWN' : 'UP');
      }

      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    };

    const handleTouchEnd = () => {
      touchStartRef.current = null;
    };

    return (
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="w-full h-full flex items-center justify-center overflow-hidden"
      >
        <canvas ref={canvasRef} className="block" />
      </div>
    );
  }
);

GameCanvas.displayName = 'GameCanvas';
