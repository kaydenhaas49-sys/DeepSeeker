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

// Blend the horizontal repeat edges of procedural wallpaper.
// The wall UVs repeat along wall length; mismatched border pixels can look like black hairlines.
function blendHorizontalTextureEdges(canvas, blend = 20) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const image = ctx.getImageData(0, 0, width, height);
  const source = new Uint8ClampedArray(image.data);
  const channels = 4;
  const edgeWidth = Math.min(blend, Math.floor(width / 2));

  for (let y = 0; y < height; y++) {
    for (let d = 0; d < edgeWidth; d++) {
      const left = (y * width + d) * channels;
      const right = (y * width + (width - 1 - d)) * channels;
      const amount = 1 - d / edgeWidth;
      for (let channel = 0; channel < 3; channel++) {
        const average = (source[left + channel] + source[right + channel]) * 0.5;
        image.data[left + channel] = Math.round(
          source[left + channel] * (1 - amount) + average * amount
        );
        image.data[right + channel] = Math.round(
          source[right + channel] * (1 - amount) + average * amount
        );
      }
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
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

  // A quiet, slightly faded print. Keep the pattern legible up close,
  // but avoid the perfectly crisp, high-contrast repeat of a new game texture.
  for (let y = 0; y < S / 16; y++) {
    for (let x = 0; x < S / 16; x++) {
      const px = x * 16 + 8 + (rnd() - 0.5) * 1.4;
      const py = y * 16 + 8 + (rnd() - 0.5) * 1.4;
      const worn = rnd();
      if ((x + y) % 2 === 0) {
        g.fillStyle = worn > 0.72 ? "rgba(105,94,43,0.30)" : "rgba(105,94,43,0.17)";
        g.beginPath();
        g.moveTo(px, py - 4);
        g.lineTo(px + 3, py);
        g.lineTo(px, py + 4);
        g.lineTo(px - 3, py);
        g.closePath();
        g.fill();
        g.fillStyle = "rgba(225,207,119,0.24)";
        g.fillRect(px - 0.5, py - 0.5, 1, 1);
      } else {
        g.fillStyle = "rgba(226,207,120,0.20)";
        g.fillRect(px - 3, py - 1, 1.5, 1);
        g.fillRect(px + 2, py - 1, 1.5, 1);
        g.fillStyle = "rgba(105,94,43,0.20)";
        g.fillRect(px - 0.5, py + 2, 1, 1);
      }
    }
  }

  // Subtle vertical fading and grime, with uneven edges like old wallpaper.
  for (let i = 0; i < 22; i++) {
    const x = rnd() * S;
    const width = 2 + rnd() * 9;
    const top = rnd() * 90;
    const bottom = 120 + rnd() * 100;
    const grad = g.createLinearGradient(x, top, x + width, bottom);
    grad.addColorStop(0, "rgba(65,53,20,0)");
    grad.addColorStop(0.45, `rgba(65,53,20,${0.025 + rnd() * 0.045})`);
    grad.addColorStop(1, "rgba(65,53,20,0)");
    g.fillStyle = grad;
    g.fillRect(x, top, width, bottom - top);
  }

  // A few fine scuffs and pinprick marks; sparse enough not to read as noise.
  for (let i = 0; i < 85; i++) {
    const x = rnd() * S;
    const y = rnd() * (S * 0.78);
    g.strokeStyle = rnd() > 0.5 ? "rgba(58,47,20,0.12)" : "rgba(244,224,145,0.13)";
    g.lineWidth = 0.4 + rnd() * 0.7;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 5, y + 1 + rnd() * 4);
    g.stroke();
  }

  // Fine paper grain.
  for (let i = 0; i < 3400; i++) {
    const v = rnd();
    g.fillStyle = v > 0.5 ? "rgba(255,244,180,0.045)" : "rgba(40,34,8,0.055)";
    g.fillRect(rnd() * S, rnd() * S, 1, 1);
  }

  // Keep the wallpaper clean from full-width dark bands and black edge lines.
  // Wall wear is supplied by the subtle print, scuffs, and paper grain above.
  return blendHorizontalTextureEdges(c);
}

function makeCarpet() {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const rnd = rng32(202);

  g.fillStyle = "#cfc094";
  g.fillRect(0, 0, S, S);

  // Seamless, low-contrast wear: repeat each soft mark across tile edges so
  // the carpet never forms obvious square patches at the texture boundaries.
  for (let i = 0; i < 18; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 14 + rnd() * 34;
    const light = rnd() > 0.5;
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        const px = x + ox;
        const py = y + oy;
        const grad = g.createRadialGradient(px, py, 0, px, py, r);
        grad.addColorStop(0, light ? "rgba(233,224,186,0.075)" : "rgba(178,164,120,0.065)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grad;
        g.fillRect(px - r, py - r, r * 2, r * 2);
      }
    }
  }

  // Draw every fiber periodically across the texture edges. Without these
  // wrapped copies, the canvas repeats cleanly in theory but hairline seams
  // appear where randomly clipped strokes stop at the tile boundary.
  for (let i = 0; i < 5200; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const dx = (rnd() - 0.5) * 1.5;
    const dy = 1 + rnd() * 2.5;
    const shade = rnd();
    g.strokeStyle = shade > 0.52
      ? "rgba(238,230,198,0.17)"
      : "rgba(111,98,68,0.13)";
    g.lineWidth = 0.35 + rnd() * 0.45;
    const xs = [0];
    const ys = [0];
    if (x < 2) xs.push(S);
    if (x + dx > S - 2) xs.push(-S);
    if (y < 4) ys.push(S);
    if (y + dy > S - 1) ys.push(-S);
    for (const ox of xs) for (const oy of ys) {
      g.beginPath();
      g.moveTo(x + ox, y + oy);
      g.lineTo(x + dx + ox, y + dy + oy);
      g.stroke();
    }
  }

  // Fine, uneven fibers; tiny marks crossing an edge are copied to the
  // opposite edge so adjacent repeats have no abrupt cut-off line.
  for (let i = 0; i < 4400; i++) {
    const v = rnd();
    g.fillStyle =
      v > 0.66
        ? "rgba(238,230,198,0.15)"
        : v > 0.33
          ? "rgba(196,182,138,0.16)"
          : "rgba(150,136,96,0.14)";
    const x = rnd() * S, y = rnd() * S;
    const w = 0.5 + rnd() * 1.5, h = 0.5 + rnd() * 1.3;
    const xs = [0], ys = [0];
    if (x + w > S) xs.push(-S);
    if (y + h > S) ys.push(-S);
    for (const ox of xs) for (const oy of ys) g.fillRect(x + ox, y + oy, w, h);
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
