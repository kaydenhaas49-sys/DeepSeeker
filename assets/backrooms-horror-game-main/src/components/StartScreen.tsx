// ============================================================================
// StartScreen.tsx — Title screen / loading screen shown before the game.
// ============================================================================

import { useState, useEffect } from 'react';
import { Eye, Footprints, Scroll, Flashlight, Loader2 } from 'lucide-react';
import type { HUDState } from '@/game/types';

interface Props {
  hud: HUDState;
  onStart: () => void;
}

export function StartScreen({ hud, onStart }: Props) {
  const [showStart, setShowStart] = useState(false);
  const isLoading = hud.state === 'loading';

  useEffect(() => {
    if (hud.state === 'menu') setShowStart(true);
  }, [hud.state]);

  if (hud.state === 'playing' || hud.state === 'caught' || hud.state === 'won') {
    return null;
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black">
      {/* Animated background — subtle yellow fog gradient */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(138,122,26,0.15) 0%, rgba(10,10,8,1) 70%)',
        }}
      />

      {/* Scanline overlay */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.4) 3px)',
        }}
      />

      <div className="relative z-10 flex max-w-2xl flex-col items-center px-6 text-center">
        {/* Title */}
        <h1
          className="mb-2 text-6xl font-black tracking-tighter text-amber-200/90 sm:text-7xl"
          style={{ textShadow: '0 0 30px rgba(255,200,50,0.3)' }}
        >
          THE BACKROOMS
        </h1>
        <p className="mb-8 font-mono text-sm uppercase tracking-[0.3em] text-white/40">
          Endless Reality
        </p>

        {/* Lore blurb */}
        <p className="mb-10 max-w-md text-sm leading-relaxed text-white/50">
          You've noclip'd out of reality. You're alone in the yellow rooms. Find
          the 8 lost pages. Something else is in here with you. Don't let it
          find you.
        </p>

        {/* Controls */}
        <div className="mb-10 grid grid-cols-2 gap-x-8 gap-y-3 text-left sm:grid-cols-4">
          {'ontouchstart' in window ? (
            <>
              <ControlHint icon="STICK" label="Move" />
              <ControlHint icon="DRAG" label="Look" />
              <ControlHint icon="RUN" label="Sprint" />
              <ControlHint icon="LIGHT" label="Flashlight" />
            </>
          ) : (
            <>
              <ControlHint icon="WASD" label="Move" />
              <ControlHint icon="MOUSE" label="Look" />
              <ControlHint icon="SHIFT" label="Sprint" />
              <ControlHint icon="F" label="Flashlight" />
            </>
          )}
        </div>

        {/* Start button or loading */}
        {isLoading ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-amber-300/60" />
            <p className="font-mono text-sm text-white/50">{hud.loadLabel}</p>
            <div className="h-1 w-64 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-amber-400/70 transition-all duration-300"
                style={{ width: `${hud.loadProgress * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <button
            onClick={onStart}
            className="group relative overflow-hidden rounded-lg border border-amber-400/30 bg-amber-400/10 px-12 py-4 text-lg font-bold tracking-wide text-amber-200 transition-all duration-300 hover:bg-amber-400/20 hover:ring-2 hover:ring-amber-400/40"
          >
            <span className="relative z-10">ENTER THE BACKROOMS</span>
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-amber-400/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          </button>
        )}

        {/* Feature icons */}
        <div className="mt-12 flex items-center gap-8 text-white/20">
          <Footprints className="h-6 w-6" />
          <Flashlight className="h-6 w-6" />
          <Scroll className="h-6 w-6" />
          <Eye className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

function ControlHint({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <kbd className="rounded border border-white/20 bg-white/5 px-2 py-1 font-mono text-xs text-white/70">
        {icon}
      </kbd>
      <span className="text-xs text-white/40">{label}</span>
    </div>
  );
}
