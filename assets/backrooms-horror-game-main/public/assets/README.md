# Assets Folder

Drop your custom 3D models and textures here. The game automatically uses them
if present, and falls back to procedural assets if a file is missing.

## Models (GLTF / GLB)

- `models/entity.glb` — Your terrifying entity/hunter model.
  The game scales it to fit. Make sure it faces +Z (forward) in your DCC.

## Textures (JPG / PNG)

- `textures/wallpaper_color.jpg` — Yellow mono-yellow wallpaper (1024x1024)
- `textures/carpet_color.jpg` — Damp yellow carpet (1024x1024)
- `textures/ceiling_color.jpg` — Acoustic ceiling tile (1024x1024)
- `textures/page_color.jpg` — Aged paper with scribbles (512x512)

## How it works

The asset manifest lives in `src/game/assetManifest.ts`. Update URLs there
if you rename files or add normal/roughness maps. The loader tries each URL,
and on failure generates a procedural fallback so the game always runs.

## Tips

- For PBR textures, also provide `_normal.jpg` and `_roughness.jpg` variants
  alongside the color map for best visual quality.
- Keep texture sizes at 1024x1024 for a good balance of quality and performance.
- The entity model should be roughly 2 meters tall for correct scale.
