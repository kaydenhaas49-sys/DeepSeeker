// ============================================================================
// HUD.tsx — In-game HUD overlay: stamina bar, battery indicator, page
// counter, crosshair, and contextual hints. Pure presentational.
// ============================================================================

import { Battery, BatteryLow, Flashlight, Footprints, Scroll } from 'lucide-react';
import type { HUDState } from '@/game/types';

interface Props {
  hud: HUDState;
}

export function HUD({ hud }: Props) {
  if (hud.state !== 'playing') return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 select-none">
      {/* Crosshair */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="h-1.5 w-1.5 rounded-full bg-white/40" />
      </div>

      {/* Bottom-left: stamina + battery */}
      <div className="absolute bottom-6 left-6 flex flex-col gap-3">
        {/* Stamina */}
        <div className="flex items-center gap-2">
          <Footprints
            className={`h-5 w-5 ${hud.staminaActive ? 'text-amber-400' : 'text-white/70'}`}
          />
          <div className="h-2 w-40 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10">
            <div
              className={`h-full rounded-full transition-all duration-150 ${
                hud.stamina < 20
                  ? 'bg-red-500'
                  : hud.staminaActive
                  ? 'bg-amber-400'
                  : 'bg-emerald-500/80'
              }`}
              style={{ width: `${hud.stamina}%` }}
            />
          </div>
        </div>

        {/* Battery */}
        <div className="flex items-center gap-2">
          {hud.battery < 20 ? (
            <BatteryLow className="h-5 w-5 text-red-400" />
          ) : (
            <Battery
              className={`h-5 w-5 ${hud.flashlightOn ? 'text-yellow-300' : 'text-white/40'}`}
            />
          )}
          <div className="h-2 w-40 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10">
            <div
              className={`h-full rounded-full transition-all duration-200 ${
                hud.battery < 20 ? 'bg-red-500' : 'bg-yellow-400/80'
              }`}
              style={{ width: `${hud.battery}%` }}
            />
          </div>
          {!hud.flashlightOn && (
            <span className="text-xs font-medium text-white/40">OFF</span>
          )}
        </div>
      </div>

      {/* Top-right: page counter */}
      <div className="absolute right-6 top-6 flex items-center gap-2 rounded-lg bg-black/40 px-4 py-2 ring-1 ring-white/10 backdrop-blur-sm">
        <Scroll className="h-5 w-5 text-amber-200" />
        <span className="font-mono text-lg font-bold text-amber-100">
          {hud.pagesCollected}
          <span className="text-white/40"> / {hud.pagesTotal}</span>
        </span>
      </div>

      {/* Bottom-center: controls hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center">
        <p className="font-mono text-xs text-white/30">
          {'ontouchstart' in window
            ? 'Left stick: move · Right side: look · Buttons: sprint, flashlight, jump'
            : 'WASD move · SHIFT sprint · F flashlight · MOUSE look'}
        </p>
      </div>
    </div>
  );
}
