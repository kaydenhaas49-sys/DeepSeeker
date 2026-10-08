import { useEffect, useRef, useState, useCallback } from 'react';
import { Game } from '@/game/game';
import { createInitialHUD, type HUDState } from '@/game/types';
import { StartScreen } from '@/components/StartScreen';
import { HUD } from '@/components/HUD';
import { GameOverScreen } from '@/components/GameOverScreen';
import { TouchControls } from '@/components/TouchControls';
import type { InputManager } from '@/game/input';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HUDState>(createInitialHUD());
  const [inputMgr, setInputMgr] = useState<InputManager | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const game = new Game(containerRef.current);
    gameRef.current = game;
    game.onHUDUpdate = (newHud) => setHud(newHud);
    setInputMgr(game.input);

    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, []);

  const handleStart = useCallback(() => {
    gameRef.current?.start();
  }, []);

  const handleRestart = useCallback(() => {
    gameRef.current?.restart();
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      {/* Three.js canvas mounts here */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* UI overlays */}
      <StartScreen hud={hud} onStart={handleStart} />
      <HUD hud={hud} />
      <GameOverScreen hud={hud} onRestart={handleRestart} />

      {/* Touch controls for mobile */}
      <TouchControls
        input={inputMgr}
        visible={hud.state === 'playing'}
      />
    </div>
  );
}

export default App;
