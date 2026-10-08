// ============================================================================
// GameOverScreen.tsx — Shown when caught or when all pages collected.
// ============================================================================

import { Skull, Trophy, RotateCcw } from 'lucide-react';
import type { HUDState } from '@/game/types';

interface Props {
  hud: HUDState;
  onRestart: () => void;
}

export function GameOverScreen({ hud, onRestart }: Props) {
  if (hud.state !== 'caught' && hud.state !== 'won') return null;

  const won = hud.state === 'won';

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/90">
      {/* Red flash for caught, gold for won */}
      <div
        className="absolute inset-0"
        style={{
          background: won
            ? 'radial-gradient(ellipse at center, rgba(255,200,50,0.08) 0%, transparent 60%)'
            : 'radial-gradient(ellipse at center, rgba(180,20,20,0.12) 0%, transparent 60%)',
        }}
      />

      {/* Scanlines */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.5) 3px)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        {won ? (
          <>
            <Trophy className="mb-6 h-16 w-16 text-amber-300" />
            <h2 className="mb-3 text-5xl font-black tracking-tight text-amber-200">
              YOU ESCAPED
            </h2>
            <p className="mb-2 max-w-md text-sm text-white/50">
              You found all {hud.pagesTotal} pages and found a way out. For now.
            </p>
          </>
        ) : (
          <>
            <Skull className="mb-6 h-16 w-16 text-red-500" />
            <h2 className="mb-3 text-5xl font-black tracking-tight text-red-500">
              YOU WERE FOUND
            </h2>
            <p className="mb-2 max-w-md text-sm text-white/50">
              The Hunter caught you in the yellow rooms. You collected{' '}
              {hud.pagesCollected} of {hud.pagesTotal} pages.
            </p>
          </>
        )}

        <button
          onClick={onRestart}
          className="mt-8 flex items-center gap-3 rounded-lg border border-white/20 bg-white/5 px-10 py-3.5 text-base font-bold text-white/80 transition-all duration-300 hover:bg-white/10 hover:ring-2 hover:ring-white/20"
        >
          <RotateCcw className="h-5 w-5" />
          {won ? 'PLAY AGAIN' : 'TRY AGAIN'}
        </button>
      </div>
    </div>
  );
}
