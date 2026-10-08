// ============================================================================
// constants.ts — Central tuning values for the Backrooms game.
// Everything is data so designers can tweak feel without touching logic.
// ============================================================================

export const PLAYER = {
  EYE_HEIGHT: 1.7,
  RADIUS: 0.35,
  WALK_SPEED: 3.2,
  SPRINT_SPEED: 6.4,
  ACCEL: 14,
  DECEL: 10,
  JUMP_FORCE: 5.2,
  GRAVITY: 18,
  STAMINA_MAX: 100,
  STAMINA_DRAIN: 22, // per second sprinting
  STAMINA_REGEN: 14, // per second walking/idle
  STAMINA_MIN_SPRINT: 5, // need this much to start a sprint
  HEADBOB_FREQ: 9,
  HEADBOB_AMP: 0.045,
  HEADBOB_SPRINT_AMP: 0.075,
  FOOTSTEP_INTERVAL: 0.5, // seconds between steps walking
  FOOTSTEP_INTERVAL_SPRINT: 0.32,
} as const;

export const FLASHLIGHT = {
  INTENSITY: 26,
  DISTANCE: 34,
  ANGLE: 0.5,
  PENUMBRA: 0.45,
  DECAY: 1.6,
  BATTERY_MAX: 100,
  BATTERY_DRAIN: 1.7, // per second
  FLICKER_CHANCE: 0.012, // per frame
  SHADOW_MAP_SIZE: 1024,
  SHADOW_BIAS: -0.0008,
} as const;

export const ENTITY = {
  RADIUS: 0.5,
  HEIGHT: 2.1,
  ROAM_SPEED: 1.7,
  HUNT_SPEED: 3.6,
  ENRAGE_SPEED: 4.9,
  SIGHT_RANGE: 26,
  SIGHT_FOV: Math.PI * 0.62, // ~112°
  HEAR_SPRINT_RANGE: 34,
  HEAR_FLASHLIGHT_RANGE: 18,
  CATCH_DISTANCE: 1.4,
  PATH_REPLAN_INTERVAL: 0.7, // seconds
  ROAM_PICK_INTERVAL: 4.5,
  GIVEUP_TIME: 7, // seconds since last seen player before returning to roam
} as const;

export const MAZE = {
  CELL_SIZE: 4, // meters per cell
  WALL_HEIGHT: 3.2,
  COLS: 21, // odd for proper maze
  ROWS: 21,
  PAGE_COUNT: 8,
  PAGE_PLACEMENT_ATTEMPTS: 60,
} as const;

export const FOG = {
  COLOR: 0x0a0a08,
  NEAR: 2,
  FAR: 22,
} as const;

export const POST = {
  VIGNETTE_DARKNESS: 1.05,
  VIGNETTE_OFFSET: 1.1,
  FILM_GRAIN_INTENSITY: 0.09,
  FILM_GRAIN_SPEED: 1.0,
  CHROMATIC_ABERRATION: 0.0018,
  FISHEYE_STRENGTH: 0.16,
  SCANLINE_INTENSITY: 0.06,
  SCANLINE_COUNT: 700,
} as const;

export const COLORS = {
  WALL: 0x8a7a1a,
  WALL_TINT: 0x6b5f14,
  FLOOR: 0x7d6e15,
  CEILING: 0x9a8a25,
  PAGE: 0xf5f0d0,
  ENTITY: 0x1a1a1a,
  AMBIENT: 0x202018,
} as const;

export const FLUORESCENT = {
  FLICKER_CHANCE: 0.004,
  OUTAGE_CHANCE: 0.0008,
  BASE_INTENSITY: 0.55,
  FLICKER_MIN: 0.08,
} as const;
