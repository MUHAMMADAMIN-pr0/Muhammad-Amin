import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { soundEngine } from '../game/audio';
import { Direction, GameState, HudStats } from '../game/types';
import { GameCanvas, GameCanvasHandle } from './GameCanvas';

const BACKDROP_IMAGE = '/src/assets/images/terrarium_backdrop_1794905838048.jpg';

const INITIAL_STATS: HudStats = {
  score: 0,
  length: 4,
  speedMultiplier: 1.0,
  ratSpeedMultiplier: 1.0,
  ratsEaten: 0,
  goldenRatsEaten: 0,
  bestScore: 0,
  isNewRecord: false,
  deathReason: null,
};

export function GameShell() {
  const canvasHandleRef = useRef<GameCanvasHandle | null>(null);
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [stats, setStats] = useState<HudStats>(INITIAL_STATS);
  const [isMuted, setIsMuted] = useState<boolean>(() => soundEngine.isMuted());
  const [backdropError, setBackdropError] = useState<boolean>(false);

  const gameStateRef = useRef<GameState>(gameState);
  gameStateRef.current = gameState;

  const startGame = useCallback(() => {
    soundEngine.unlock();
    canvasHandleRef.current?.startNewGame();
    setGameState('PLAYING');
  }, []);

  const togglePause = useCallback(() => {
    const current = gameStateRef.current;
    if (current === 'PLAYING') {
      canvasHandleRef.current?.setGameState('PAUSED');
      setGameState('PAUSED');
    } else if (current === 'PAUSED') {
      canvasHandleRef.current?.setGameState('PLAYING');
      setGameState('PLAYING');
    }
  }, []);

  const returnToTitle = useCallback(() => {
    canvasHandleRef.current?.setGameState('TITLE_MENU');
    setGameState('TITLE_MENU');
  }, []);

  const toggleMute = useCallback(() => {
    const next = !soundEngine.isMuted();
    soundEngine.setMuted(next);
    setIsMuted(next);
    if (!next) {
      soundEngine.unlock();
    }
  }, []);

  const handleGameOver = useCallback((finalStats: HudStats) => {
    setStats(finalStats);
    setGameState('GAME_OVER');
  }, []);

  const handleTouchDirection = useCallback((dir: Direction) => {
    soundEngine.unlock();
    canvasHandleRef.current?.queueDirection(dir);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      const lower = key.toLowerCase();

      if (
        key === 'ArrowUp' ||
        key === 'ArrowDown' ||
        key === 'ArrowLeft' ||
        key === 'ArrowRight' ||
        key === ' '
      ) {
        e.preventDefault();
      }

      if (lower === 'm') {
        toggleMute();
        return;
      }

      const current = gameStateRef.current;

      if (current === 'TITLE_MENU') {
        if (key === 'Enter' || key === ' ') {
          startGame();
        }
        return;
      }

      if (current === 'GAME_OVER') {
        if (key === 'Enter' || key === ' ') {
          startGame();
        } else if (key === 'Escape') {
          returnToTitle();
        }
        return;
      }

      if (key === ' ' || lower === 'p' || key === 'Escape') {
        togglePause();
        return;
      }

      if (current === 'PLAYING') {
        if (key === 'ArrowUp' || lower === 'w') {
          canvasHandleRef.current?.queueDirection('UP');
        } else if (key === 'ArrowDown' || lower === 's') {
          canvasHandleRef.current?.queueDirection('DOWN');
        } else if (key === 'ArrowLeft' || lower === 'a') {
          canvasHandleRef.current?.queueDirection('LEFT');
        } else if (key === 'ArrowRight' || lower === 'd') {
          canvasHandleRef.current?.queueDirection('RIGHT');
        }
      }
    };

    const onWindowBlur = () => {
      canvasHandleRef.current?.clearInputQueue();
    };

    const onVisibilityChange = () => {
      if (document.hidden && gameStateRef.current === 'PLAYING') {
        canvasHandleRef.current?.setGameState('PAUSED');
        setGameState('PAUSED');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [returnToTitle, startGame, toggleMute, togglePause]);

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#0e1510] text-stone-100 select-none flex flex-col">
      {/* Subtle perimeter botanical atmosphere */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.06)_0%,rgba(14,21,16,0.92)_75%)]"
      />

      {/* Top Perimeter HUD (Low occlusion, zero pill clutter, tabular-nums) */}
      {gameState !== 'TITLE_MENU' && (
        <header className="pointer-events-none relative z-20 flex items-center justify-between gap-4 px-4 sm:px-8 pt-3 pb-1 shrink-0">
          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
            <span className="hidden sm:inline font-display text-base font-semibold tracking-tight text-stone-200 whitespace-nowrap">
              Verdant Fang
            </span>

            <div className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm">
              <div className="flex items-baseline gap-1.5">
                <span className="text-stone-400">Score</span>
                <span className="font-mono font-bold text-base sm:text-lg text-emerald-400 tabular-nums">
                  {stats.score}
                </span>
              </div>

              <span aria-hidden="true" className="text-stone-700">
                /
              </span>

              <div className="flex items-baseline gap-1.5">
                <span className="text-stone-400">Length</span>
                <span className="font-mono font-semibold text-stone-100 tabular-nums">
                  {stats.length}
                </span>
              </div>

              <span aria-hidden="true" className="text-stone-700">
                /
              </span>

              <div className="flex items-baseline gap-1.5">
                <span className="text-stone-400">Speed</span>
                <span className="font-mono font-semibold text-amber-300 tabular-nums">
                  {stats.speedMultiplier.toFixed(1)}x
                </span>
              </div>

              <span aria-hidden="true" className="hidden sm:inline text-stone-700">
                /
              </span>

              <div className="hidden sm:flex items-baseline gap-1.5">
                <span className="text-stone-400">Rat</span>
                <span className="font-mono font-semibold text-stone-200 tabular-nums">
                  {stats.ratSpeedMultiplier.toFixed(1)}x
                </span>
              </div>

              <span aria-hidden="true" className="hidden md:inline text-stone-700">
                /
              </span>

              <div className="hidden md:flex items-baseline gap-1.5">
                <span className="text-stone-400">Best</span>
                <span className="font-mono font-semibold text-stone-300 tabular-nums">
                  {stats.bestScore}
                </span>
              </div>
            </div>
          </div>

          <div className="pointer-events-auto flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
              title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
              className="h-10 w-10 flex items-center justify-center rounded-lg border border-stone-200/12 bg-[#162019] text-stone-300 hover:text-stone-100 hover:border-stone-200/25 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-400"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={togglePause}
              aria-label={gameState === 'PAUSED' ? 'Resume game' : 'Pause game'}
              title={gameState === 'PAUSED' ? 'Resume (Space)' : 'Pause (Space)'}
              className="h-10 w-10 flex items-center justify-center rounded-lg border border-stone-200/12 bg-[#162019] text-stone-300 hover:text-stone-100 hover:border-stone-200/25 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-400"
            >
              {gameState === 'PAUSED' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
          </div>
        </header>
      )}

      {/* Main Playfield Container (occupies >= 85% of viewport) */}
      <main className="relative z-10 flex-1 min-h-0 px-2 sm:px-6 pb-2 sm:pb-5 pt-1 flex flex-col items-center justify-center">
        <div className="w-full h-full min-h-0">
          <GameCanvas onStatsChange={setStats} onGameOver={handleGameOver} ref={canvasHandleRef} />
        </div>

        {/* Touch D-Pad for mobile / small touch viewports during play */}
        {gameState === 'PLAYING' && (
          <div className="md:hidden shrink-0 pt-2 pb-1 flex items-center justify-center gap-3">
            <button
              type="button"
              onPointerDown={() => handleTouchDirection('LEFT')}
              aria-label="Move left"
              className="h-12 w-12 flex items-center justify-center rounded-lg border border-stone-200/15 bg-[#162019] active:bg-emerald-900/50 text-stone-200"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onPointerDown={() => handleTouchDirection('UP')}
                aria-label="Move up"
                className="h-12 w-12 flex items-center justify-center rounded-lg border border-stone-200/15 bg-[#162019] active:bg-emerald-900/50 text-stone-200"
              >
                <ArrowUp className="w-5 h-5" />
              </button>
              <button
                type="button"
                onPointerDown={() => handleTouchDirection('DOWN')}
                aria-label="Move down"
                className="h-12 w-12 flex items-center justify-center rounded-lg border border-stone-200/15 bg-[#162019] active:bg-emerald-900/50 text-stone-200"
              >
                <ArrowDown className="w-5 h-5" />
              </button>
            </div>
            <button
              type="button"
              onPointerDown={() => handleTouchDirection('RIGHT')}
              aria-label="Move right"
              className="h-12 w-12 flex items-center justify-center rounded-lg border border-stone-200/15 bg-[#162019] active:bg-emerald-900/50 text-stone-200"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </main>

      {/* TITLE SCREEN OVERLAY */}
      {gameState === 'TITLE_MENU' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#0b110d]">
          {!backdropError ? (
            <img
              src={BACKDROP_IMAGE}
              alt="Mossy stone botanical terrarium arena"
              referrerPolicy="no-referrer"
              onError={() => setBackdropError(true)}
              className="absolute inset-0 h-full w-full object-cover opacity-85"
            />
          ) : (
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(circle_at_center,#1b2e21_0%,#0c130e_70%)]"
            />
          )}

          {/* Measured contrast scrim preserving calm dark negative space */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(10,16,12,0.58)_0%,rgba(8,12,9,0.88)_85%)]"
          />

          {/* Top-right mute toggle on Title Screen */}
          <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
              title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
              className="h-10 w-10 flex items-center justify-center rounded-lg border border-stone-200/15 bg-[#141e17]/90 text-stone-300 hover:text-stone-100 hover:border-stone-200/30 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-400"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>

          <div className="relative z-10 max-w-lg px-6 text-center flex flex-col items-center">
            {/* Bespoke Inline SVG Serpent Emblem & Title Lockup */}
            <svg
              viewBox="0 0 120 56"
              className="w-24 h-12 mb-4 text-emerald-400"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M12 38C22 18 36 18 46 30C56 42 70 42 82 26C89 17 98 16 106 20"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path
                d="M106 20L114 17M106 20L113 24"
                stroke="#fb7185"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <circle cx="98" cy="18" r="2.2" fill="#fde047" />
              <circle cx="24" cy="24" r="1.8" fill="#86efac" opacity="0.55" />
              <circle cx="62" cy="36" r="1.8" fill="#86efac" opacity="0.55" />
            </svg>

            <h1
              className="font-display text-4xl sm:text-6xl font-bold tracking-tight text-stone-50 mb-3"
              style={{ textWrap: 'balance' }}
            >
              Verdant Fang
            </h1>

            <p className="text-sm sm:text-base text-stone-300 leading-relaxed max-w-md mb-8">
              Hunt darting field rats and fleeting golden bonus rats inside the carved stone
              terrarium. Each catch grows your serpent and accelerates the pace.
            </p>

            {stats.bestScore > 0 && (
              <div className="mb-6 text-xs sm:text-sm text-stone-400">
                <span>Best Score</span>
                <span aria-hidden="true" className="mx-2 text-stone-600">
                  ·
                </span>
                <span className="font-mono font-semibold text-amber-300 tabular-nums">
                  {stats.bestScore}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={startGame}
              className="px-8 py-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-stone-950 font-semibold text-base tracking-tight transition-all cursor-pointer shadow-lg shadow-emerald-950/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 whitespace-nowrap"
            >
              Start Game
            </button>

            <p className="mt-7 text-xs text-stone-400 tracking-wide">
              WASD / Arrows Move · Space / P Pause · M Mute
            </p>
          </div>
        </div>
      )}

      {/* PAUSE MODAL */}
      {gameState === 'PAUSED' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-heading"
          className="fixed inset-0 z-30 flex items-center justify-center bg-[#090e0b]/80 px-4"
        >
          <div className="w-full max-w-sm rounded-xl border border-stone-200/12 bg-[#162019] p-7 text-center shadow-2xl">
            <h2 id="pause-heading" className="font-display text-2xl font-bold text-stone-100 mb-2">
              Game Paused
            </h2>
            <p className="text-sm text-stone-400 mb-6 tabular-nums">
              Score {stats.score} · Length {stats.length} · Speed {stats.speedMultiplier.toFixed(1)}x
            </p>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={togglePause}
                className="w-full py-2.5 px-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={startGame}
                className="w-full py-2.5 px-5 rounded-lg border border-stone-200/15 bg-[#1c2820] hover:bg-[#233228] text-stone-100 font-medium text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                Restart
              </button>
              <button
                type="button"
                onClick={returnToTitle}
                className="w-full py-2.5 px-5 rounded-lg text-stone-400 hover:text-stone-200 font-medium text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                Title Screen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER MODAL */}
      {gameState === 'GAME_OVER' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gameover-heading"
          className="fixed inset-0 z-30 flex items-center justify-center bg-[#090e0b]/82 px-4"
        >
          <div className="w-full max-w-md rounded-xl border border-stone-200/12 bg-[#162019] p-7 sm:p-8 text-center shadow-2xl">
            <p className="text-xs font-medium text-rose-400 mb-1.5">
              {stats.deathReason === 'WALL'
                ? 'Struck the stone wall'
                : 'Crossed your own path'}
            </p>
            <h2
              id="gameover-heading"
              className="font-display text-3xl font-bold text-stone-50 mb-5"
            >
              Run Ended
            </h2>

            <div className="mb-6 py-4 border-y border-stone-200/10">
              <div className="text-xs text-stone-400 mb-1">Final Score</div>
              <div className="font-mono text-4xl font-bold text-emerald-400 tabular-nums">
                {stats.score}
              </div>
              {stats.isNewRecord && stats.score > 0 && (
                <div className="mt-1.5 text-xs font-semibold text-amber-300">
                  New Best Record
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4 mb-7 text-center">
              <div>
                <div className="text-xs text-stone-400 mb-1">Rats Caught</div>
                <div className="font-mono text-lg font-semibold text-stone-100 tabular-nums">
                  {stats.ratsEaten}
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-400 mb-1">Peak Speed</div>
                <div className="font-mono text-lg font-semibold text-amber-300 tabular-nums">
                  {stats.speedMultiplier.toFixed(1)}x
                </div>
              </div>
              <div>
                <div className="text-xs text-stone-400 mb-1">Best Score</div>
                <div className="font-mono text-lg font-semibold text-stone-100 tabular-nums">
                  {stats.bestScore}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={startGame}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-4 h-4" />
                Play Again
              </button>
              <button
                type="button"
                onClick={returnToTitle}
                className="py-3 px-5 rounded-lg border border-stone-200/15 bg-[#1c2820] hover:bg-[#233228] text-stone-200 font-medium text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                Title Screen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
