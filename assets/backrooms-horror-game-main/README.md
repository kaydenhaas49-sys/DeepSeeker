# The Backrooms — Endless Reality

A 3D Backrooms horror game built with Three.js, React, and Vite. Explore a procedurally-generated maze, collect 8 lost pages, and avoid The Hunter.

## Features

- First-person controller with physics, head-bobbing, stamina system
- Dynamic flashlight with battery drain and flicker
- Entity AI with state machine (roam, investigate, hunt, enrage), line-of-sight, and A* pathfinding
- VHS/found-footage post-processing: film grain, chromatic aberration, fisheye, scanlines, vignette
- Procedural maze generation with looping corridors
- Synthesized audio (Web Audio API) — no external sound files needed
- Flickering fluorescent lights with random outages
- GLTFLoader asset system — drop your own .glb models and textures in /public/assets
- Procedural fallback textures so the game always runs

## Controls

- **WASD** — Move
- **Mouse** — Look
- **Shift** — Sprint (drains stamina)
- **F** — Toggle flashlight
- **Space** — Jump / Interact

## Custom Assets

Drop your own models and textures in `public/assets/`. See `public/assets/README.md` for details. The game falls back to procedural assets when files are missing.

## Tech Stack

- Three.js (WebGL 3D rendering)
- React + TypeScript
- Vite
- Tailwind CSS
- Lucide React icons

## Getting Started

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
