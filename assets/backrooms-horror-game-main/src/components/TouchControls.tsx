// ============================================================================
// TouchControls.tsx — On-screen controls for mobile/Android.
// Left joystick for movement, right side drag for looking, buttons for
// sprint, flashlight, and jump. Only visible on touch devices.
// ============================================================================

import { useRef, useEffect, useState, useCallback } from 'react';
import { Flashlight, Footprints, ArrowUp } from 'lucide-react';
import type { InputManager } from '@/game/input';

interface Props {
  input: InputManager | null;
  visible: boolean;
}

export function TouchControls({ input, visible }: Props) {
  const joystickRef = useRef<HTMLDivElement>(null);
  const lookAreaRef = useRef<HTMLDivElement>(null);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const [isLooking, setIsLooking] = useState(false);
  const [sprintActive, setSprintActive] = useState(false);
  const [flashlightOn, setFlashlightOn] = useState(true);

  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const check = () => setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
    check();
  }, []);

  if (!isTouch || !visible || !input) return null;

  const handleJoystickStart = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    updateJoystick(touch.clientX, touch.clientY);
  };

  const handleJoystickMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    updateJoystick(touch.clientX, touch.clientY);
  };

  const handleJoystickEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    setJoystickPos({ x: 0, y: 0 });
    input.touchMoveX = 0;
    input.touchMoveY = 0;
    input.touchSprint = false;
    setSprintActive(false);
  };

  const updateJoystick = (clientX: number, clientY: number) => {
    const el = joystickRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const maxDist = rect.width / 2;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist) {
      dx = (dx / dist) * maxDist;
      dy = (dy / dist) * maxDist;
    }
    setJoystickPos({ x: dx, y: dy });
    input.touchMoveX = dx / maxDist;
    input.touchMoveY = -dy / maxDist;
  };

  const lookTouchId = useRef<number | null>(null);
  const lastLookPos = useRef({ x: 0, y: 0 });

  const handleLookStart = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[e.touches.length - 1];
    lookTouchId.current = touch.identifier;
    lastLookPos.current = { x: touch.clientX, y: touch.clientY };
    setIsLooking(true);
  };

  const handleLookMove = (e: React.TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      if (touch.identifier === lookTouchId.current) {
        const dx = touch.clientX - lastLookPos.current.x;
        const dy = touch.clientY - lastLookPos.current.y;
        input.touchLookX += dx;
        input.touchLookY += dy;
        lastLookPos.current = { x: touch.clientX, y: touch.clientY };
        break;
      }
    }
  };

  const handleLookEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    lookTouchId.current = null;
    setIsLooking(false);
  };

  const handleSprintToggle = useCallback(() => {
    const newVal = !sprintActive;
    setSprintActive(newVal);
    input.touchSprint = newVal;
  }, [sprintActive, input]);

  const handleFlashlight = useCallback(() => {
    input.flashlightToggleQueued = true;
    setFlashlightOn((v) => !v);
  }, [input]);

  const handleJump = useCallback(() => {
    input.touchJumpQueued = true;
  }, [input]);

  return (
    <div className="pointer-events-none fixed inset-0 z-10 select-none">
      {/* Look area — right half of screen */}
      <div
        ref={lookAreaRef}
        className="pointer-events-auto absolute right-0 top-0 h-full w-1/2"
        onTouchStart={handleLookStart}
        onTouchMove={handleLookMove}
        onTouchEnd={handleLookEnd}
        onTouchCancel={handleLookEnd}
      />

      {/* Joystick — bottom-left */}
      <div
        ref={joystickRef}
        className="pointer-events-auto absolute bottom-8 left-8 h-36 w-36 touch-none rounded-full border-2 border-white/15 bg-white/5 backdrop-blur-sm"
        onTouchStart={handleJoystickStart}
        onTouchMove={handleJoystickMove}
        onTouchEnd={handleJoystickEnd}
        onTouchCancel={handleJoystickEnd}
      >
        <div
          className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full border-2 border-white/30 bg-white/15"
          style={{
            transform: `translate(calc(-50% + ${joystickPos.x}px), calc(-50% + ${joystickPos.y}px))`,
          }}
        />
      </div>

      {/* Action buttons — bottom-right */}
      <div className="absolute bottom-8 right-6 flex flex-col items-end gap-3">
        <div className="flex gap-3">
          {/* Flashlight */}
          <button
            onPointerDown={(e) => { e.preventDefault(); handleFlashlight(); }}
            className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/15 bg-white/5 backdrop-blur-sm active:scale-90 active:bg-white/15"
          >
            <Flashlight className={`h-6 w-6 ${flashlightOn ? 'text-yellow-300' : 'text-white/40'}`} />
          </button>

          {/* Sprint */}
          <button
            onPointerDown={(e) => { e.preventDefault(); handleSprintToggle(); }}
            className={`pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border-2 backdrop-blur-sm active:scale-90 ${
              sprintActive
                ? 'border-amber-400/50 bg-amber-400/20'
                : 'border-white/15 bg-white/5'
            }`}
          >
            <Footprints className={`h-6 w-6 ${sprintActive ? 'text-amber-400' : 'text-white/50'}`} />
          </button>
        </div>

        {/* Jump */}
        <button
          onPointerDown={(e) => { e.preventDefault(); handleJump(); }}
          className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/15 bg-white/5 backdrop-blur-sm active:scale-90 active:bg-white/15"
        >
          <ArrowUp className="h-7 w-7 text-white/70" />
        </button>
      </div>

      {/* Look indicator */}
      {isLooking && (
        <div className="absolute right-1/4 top-1/2 -translate-y-1/2 text-white/10">
          <div className="h-8 w-8 rounded-full border-2 border-white/10" />
        </div>
      )}
    </div>
  );
}
