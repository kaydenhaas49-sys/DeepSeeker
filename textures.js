// textures.js — procedural canvas textures (no external assets).
// Every surface in the backrooms is drawn here at startup:
//   wall    — mustard wallpaper, small repeating motif, dark baseboard strip
//   floor   — warm beige carpet with fine noise
//   ceiling — off-white drop tiles with a dark grid
//   panel   — fluorescent fixture: dark frame + warm-white diffuser
import * as THREE from "three";

function canvasTexture(canvas, anisotropy) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  return tex;
}

// Deterministic small PRNG so textures look the same every load.
function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeWallpaper() {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const rnd = rng32(101);

  // base golden-yellow
  g.fillStyle = "#bfa93f";
  g.fillRect(0, 0, S, S);

  // small repeating motif on a 16px grid (alternates per cell)
  for (let y = 0; y < S / 16; y++) {
    for (let x = 0; x < S / 16; x++) {
      const px = x * 16 + 8;
      const py = y * 16 + 8;
      const even = (x + y) % 2 === 0;
      if (even) {
        // small diamond, darker olive
        g.fillStyle = "#9a8b2f";
        g.beginPath();
        g.moveTo(px, py - 5);
        g.lineTo(px + 4, py);
        g.lineTo(px, py + 5);
        g.lineTo(px - 4, py);
        g.closePath();
        g.fill();
        // center dot, lighter
        g.fillStyle = "#c8b954";
        g.fillRect(px - 1, py - 1, 2, 2);
      } else {
        // two small dots
        g.fillStyle = "#c2b24b";
        g.fillRect(px - 4, py - 1, 2, 2);
        g.fillRect(px + 2, py - 1, 2, 2);
        g.fillStyle = "#8f812c";
        g.fillRect(px - 1, py + 3, 2, 2);
      }
    }
  }

  // faint grain over everything
  for (let i = 0; i < 2600; i++) {
    const v = rnd();
    g.fillStyle = v > 0.5 ? "rgba(255,244,180,0.05)" : "rgba(40,34,8,0.06)";
    g.fillRect(rnd() * S, rnd() * S, 1, 1);
  }

  // dark baseboard strip along the bottom (~15% of tile height)
  const bb = Math.round(S * 0.15);
  g.fillStyle = "#392c1a";
  g.fillRect(0, S - bb, S, bb);
  g.fillStyle = "#57452a";
  g.fillRect(0, S - bb, S, 2); // top edge highlight
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.fillRect(0, S - 3, S, 3); // floor contact shadow
  return c;
}

function makeCarpet() {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const rnd = rng32(202);

  g.fillStyle = "#cfc094";
  g.fillRect(0, 0, S, S);

  // soft large-scale blotches
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 20 + rnd() * 60;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const light = rnd() > 0.5;
    grad.addColorStop(0, light ? "rgba(233,224,186,0.16)" : "rgba(178,164,120,0.14)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // fine carpet noise
  for (let i = 0; i < 9000; i++) {
    const v = rnd();
    g.fillStyle =
      v > 0.66
        ? "rgba(238,230,198,0.20)"
        : v > 0.33
          ? "rgba(196,182,138,0.20)"
          : "rgba(150,136,96,0.16)";
    g.fillRect(rnd() * S, rnd() * S, 1 + (rnd() > 0.8 ? 1 : 0), 1);
  }
  return c;
}

function makeCeiling() {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const rnd = rng32(303);

  const TILE = S / 4; // 4x4 tiles per canvas; canvas covers 4m -> 1m tiles
  for (let ty = 0; ty < 4; ty++) {
    for (let tx = 0; tx < 4; tx++) {
      // per-tile brightness variation (subdued beige, not bright cream)
      const l = 174 + Math.floor(rnd() * 12) - 6;
      g.fillStyle = `rgb(${l},${l - 4},${l - 18})`;
      g.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      // inner bevel: lighter top-left, darker bottom-right
      g.fillStyle = "rgba(255,255,255,0.25)";
      g.fillRect(tx * TILE, ty * TILE, TILE, 2);
      g.fillRect(tx * TILE, ty * TILE, 2, TILE);
      g.fillStyle = "rgba(90,86,70,0.30)";
      g.fillRect(tx * TILE, ty * TILE + TILE - 2, TILE, 2);
      g.fillRect(tx * TILE + TILE - 2, ty * TILE, 2, TILE);
    }
  }
  // dark grid lines
  g.strokeStyle = "#5f5b48";
  g.lineWidth = 4;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * TILE, 0);
    g.lineTo(i * TILE, S);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i * TILE);
    g.lineTo(S, i * TILE);
    g.stroke();
  }
  // faint stains
  for (let i = 0; i < 10; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 10 + rnd() * 30;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(120,112,84,0.10)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return c;
}

function makePanel() {
  const W = 128;
  const H = 64;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");

  // dark fixture frame
  g.fillStyle = "#26231c";
  g.fillRect(0, 0, W, H);

  // warm-white diffuser with soft edge falloff
  const pad = 7;
  const grad = g.createLinearGradient(0, pad, 0, H - pad);
  grad.addColorStop(0, "#e8dcae");
  grad.addColorStop(0.5, "#fff7d9");
  grad.addColorStop(1, "#e8dcae");
  g.fillStyle = grad;
  g.fillRect(pad, pad, W - pad * 2, H - pad * 2);

  // faint diffuser slats
  g.fillStyle = "rgba(160,150,110,0.18)";
  for (let y = pad + 4; y < H - pad; y += 6) {
    g.fillRect(pad, y, W - pad * 2, 1);
  }
  return c;
}

export function createTextures(anisotropy) {
  const floor = canvasTexture(makeCarpet(), anisotropy);
  floor.repeat.set(16, 16); // canvas covers 4m -> 16 repeats over a 64m chunk

  const ceiling = canvasTexture(makeCeiling(), anisotropy);
  ceiling.repeat.set(16, 16); // canvas covers 4m of 1m tiles

  return {
    wall: canvasTexture(makeWallpaper(), anisotropy), // 1 repeat = 4m (UV-remapped)
    floor,
    ceiling,
    panel: canvasTexture(makePanel(), anisotropy),
  };
}
