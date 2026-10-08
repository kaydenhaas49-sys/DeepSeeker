// ============================================================================
// types.ts — Shared TypeScript types for the game.
// ============================================================================

export type GameState = 'menu' | 'loading' | 'playing' | 'caught' | 'won';

export interface HUDState {
  stamina: number;
  staminaActive: boolean;
  battery: number;
  flashlightOn: boolean;
  pagesCollected: number;
  pagesTotal: number;
  state: GameState;
  message: string;
  loadProgress: number;
  loadLabel: string;
  _lastFootstep?: number;
}

export const createInitialHUD = (): HUDState => ({
  stamina: 100,
  staminaActive: false,
  battery: 100,
  flashlightOn: true,
  pagesCollected: 0,
  pagesTotal: 8,
  state: 'menu',
  message: '',
  loadProgress: 0,
  loadLabel: '',
});
