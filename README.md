# Backrooms: Lost Signal

A browser-based Three.js liminal-horror game with procedural Backrooms rooms, a furnished-house tutorial, a first-person hazmat viewmodel, flashlight/battery mechanics, and multiplayer encounters.

## Play

GitHub Pages: https://kaydenhaas49-sys.github.io/DeepSeeker/

## Controls

- **W A S D** — move
- **Shift** — sprint
- **Ctrl** — crouch
- **Space** — jump
- **F** — flashlight
- **P** — phone
- **N** — multiplayer map
- **Tab** — controls

## Active code

The browser game starts from `index.html` and `main.js`. Its core systems are split across `player.js`, `world.js`, `character.js`, `spiderHunter.js`, and `multiplayer.js`.

The root Godot files are a legacy prototype, and `assets/backrooms-horror-game-main/` is a separate vendored reference project; neither is the active browser-game entry point.
