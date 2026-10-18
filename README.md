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

## Campaign progression

The classroom/playtest demo follows players through three signal relays
and the eight-breaker maintenance puzzle. Restoring all three relays and
solving the breakers powers the sealed Poolrooms gate and triggers the
confetti "DEMO COMPLETE" screen. The Poolrooms themselves are intentionally
reserved for a future update and are not accessible in this build.

Decorative assets load automatically from 3DAssets.dev's CC0 CDN. They are
optional during boot, so a failed prop request cannot block the main menu or
normal Backrooms gameplay.

Models integrated:
- [Poolroom hall](https://3dassets.dev/assets/liminal-spaces-kit-poolroom-hall-d800e372) — Poolrooms architecture
- [Transmitter cabinet](https://3dassets.dev/assets/broadcast-tower-and-relay-station-broadcast-tower-and--fa1fb98a) — signal relays
- [Fire door module](https://3dassets.dev/assets/hotel-and-resort-operations-corridor-fire-door-module-95fdcb74) — Poolrooms entrance

The assets are CC0 1.0 Universal and load directly as GLB files, so no manual
download or copying into the assets folder is needed.

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

Keep the individual `THIRD_PARTY_LICENSE_*.txt` files with the assets they cover. The spider model is loaded from `assets/Spider-Psionic.zip`.
