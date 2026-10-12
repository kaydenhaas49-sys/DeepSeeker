# Backrooms: Lost Signal

A browser-based Three.js liminal-horror game.

## Play

Self-hosted game: https://lostsignal.lnxhosting.ca

## Active implementation

The active game is the browser version, starting at `index.html` and `main.js`. Core systems are split across modules including:

- `world.js` — environment and world logic
- `player.js` — first-person movement and controls
- `character.js` — player character and flashlight model
- `spiderHunter.js` and `signalStalker.js` — enemy behavior
- `multiplayer.js` — real-time multiplayer client
- `audio.js` and `textures.js` — audio and visual systems

The old Godot prototype and unrelated reference-project files are not part of the active game.

## Controls

- **W A S D** — move
- **Shift** — sprint
- **Ctrl** — crouch
- **Space** — jump
- **F** — flashlight
- **P** — phone
- **N** — multiplayer map
- **Tab** — controls

## Run locally

Because the game uses ES modules and fetches assets, serve the repository over HTTP instead of opening `index.html` directly. One simple option is:

```bash
python -m http.server 8000
```

Then open http://localhost:8000. This starts the static web server only; multiplayer remains dependent on its configured backend.

## Assets and licensing

Keep the individual `THIRD_PARTY_LICENSE_*.txt` files with the assets they cover. The spider loader prefers `assets/animated_spider.glb` and falls back to `assets/Spider-Psionic.zip` if the standalone model cannot load.
