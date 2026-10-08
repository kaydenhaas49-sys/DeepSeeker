// ============================================================================
// textureGenerator.ts — Procedural PBR texture generation via Canvas2D.
//
// Used as a fallback when real texture files are missing. Generates color,
// normal, and roughness maps that evoke the Backrooms aesthetic: damp yellow
// carpet, mono-yellow wallpaper, acoustic ceiling tiles.
// ============================================================================

import * as THREE from 'three';

type NoiseFn = (x: number, y: number) => number;

function makeValueNoise(seed: number): NoiseFn {
  const perm = new Uint8Array(512);
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];

  const grad = (h: number) => (h & 1 ? 1 : -1);
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  return (x: number, y: number) => {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[xi] + yi] / 255;
    const ab = perm[perm[xi] + yi + 1] / 255;
    const ba = perm[perm[xi + 1] + yi] / 255;
    const bb = perm[perm[xi + 1] + yi + 1] / 255;
    return lerp(lerp(aa, ba, u), lerp(ab, bb, u), v);
  };
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement, repeat: [number, number] = [1, 1]): THREE.Texture {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function toDataTexture(c: HTMLCanvasElement): THREE.DataTexture {
  const ctx = c.getContext('2d')!;
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const tex = new THREE.DataTexture(
    data.data,
    c.width,
    c.height,
    THREE.RGBAFormat
  );
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function genWallpaper(): THREE.Texture {
  const size = 1024;
  const [c, ctx] = canvas(size);
  const noise = makeValueNoise(42);

  const baseGrad = ctx.createLinearGradient(0, 0, 0, size);
  baseGrad.addColorStop(0, '#9a8a2a');
  baseGrad.addColorStop(0.5, '#8a7a1a');
  baseGrad.addColorStop(1, '#7a6a14');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, size, size);

  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = noise(x * 0.08, y * 0.08) * 0.5 + noise(x * 0.3, y * 0.3) * 0.5;
      const grime = noise(x * 0.02, y * 0.015) * 0.4;
      const stripe = Math.sin(x * 0.06) * 0.04;
      const v = (n - 0.5) * 50 + grime * 60 + stripe * 40;
      d[i] = Math.max(0, Math.min(255, d[i] + v * 0.6));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + v * 0.5));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + v * 0.2));
    }
  }
  ctx.putImageData(img, 0, 0);

  for (let s = 0; s < 8; s++) {
    const sx = Math.random() * size;
    const sy = Math.random() * size;
    const r = 40 + Math.random() * 120;
    const stain = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    stain.addColorStop(0, 'rgba(40,30,5,0.35)');
    stain.addColorStop(1, 'rgba(40,30,5,0)');
    ctx.fillStyle = stain;
    ctx.fillRect(0, 0, size, size);
  }

  return toTexture(c, [1, 1]);
}

export function genCarpet(): THREE.Texture {
  const size = 1024;
  const [c, ctx] = canvas(size);
  const noise = makeValueNoise(17);

  ctx.fillStyle = '#7d6e15';
  ctx.fillRect(0, 0, size, size);

  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const fiber = noise(x * 1.2, y * 1.2) * 0.4 + noise(x * 4, y * 4) * 0.3;
      const damp = noise(x * 0.04, y * 0.04) * 0.6;
      const v = (fiber - 0.35) * 70 + (damp - 0.3) * 50;
      d[i] = Math.max(0, Math.min(255, d[i] + v * 0.7));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + v * 0.6));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + v * 0.3));
    }
  }
  ctx.putImageData(img, 0, 0);

  for (let s = 0; s < 12; s++) {
    const sx = Math.random() * size;
    const sy = Math.random() * size;
    const r = 30 + Math.random() * 90;
    const stain = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    stain.addColorStop(0, 'rgba(20,15,5,0.4)');
    stain.addColorStop(1, 'rgba(20,15,5,0)');
    ctx.fillStyle = stain;
    ctx.fillRect(0, 0, size, size);
  }

  return toTexture(c, [3, 3]);
}

export function genCeiling(): THREE.Texture {
  const size = 1024;
  const [c, ctx] = canvas(size);
  const noise = makeValueNoise(99);

  ctx.fillStyle = '#9a8a25';
  ctx.fillRect(0, 0, size, size);

  const tileSize = size / 2;
  ctx.strokeStyle = 'rgba(40,35,10,0.7)';
  ctx.lineWidth = 6;
  for (let i = 0; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * tileSize, 0);
    ctx.lineTo(i * tileSize, size);
    ctx.moveTo(0, i * tileSize);
    ctx.lineTo(size, i * tileSize);
    ctx.stroke();
  }

  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = noise(x * 2, y * 2);
      const v = (n - 0.5) * 35;
      d[i] = Math.max(0, Math.min(255, d[i] + v));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + v));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + v * 0.5));
    }
  }
  ctx.putImageData(img, 0, 0);

  for (let s = 0; s < 5; s++) {
    const sx = Math.random() * size;
    const sy = Math.random() * size;
    const r = 50 + Math.random() * 100;
    const stain = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    stain.addColorStop(0, 'rgba(60,40,10,0.3)');
    stain.addColorStop(1, 'rgba(60,40,10,0)');
    ctx.fillStyle = stain;
    ctx.fillRect(0, 0, size, size);
  }

  return toTexture(c, [1, 1]);
}

export function genPage(): THREE.Texture {
  const size = 512;
  const [c, ctx] = canvas(size);

  ctx.fillStyle = '#e8e0c0';
  ctx.fillRect(0, 0, size, size);

  for (let s = 0; s < 6; s++) {
    const sx = Math.random() * size;
    const sy = Math.random() * size;
    const r = 40 + Math.random() * 80;
    const stain = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    stain.addColorStop(0, 'rgba(120,90,40,0.25)');
    stain.addColorStop(1, 'rgba(120,90,40,0)');
    ctx.fillStyle = stain;
    ctx.fillRect(0, 0, size, size);
  }

  ctx.strokeStyle = 'rgba(30,25,15,0.7)';
  ctx.lineWidth = 2;
  for (let l = 0; l < 14; l++) {
    const ly = 50 + l * 28;
    ctx.beginPath();
    for (let x = 40; x < size - 40; x += 4) {
      const jy = ly + Math.sin(x * 0.3 + l) * 3 + (Math.random() - 0.5) * 4;
      if (x === 40) ctx.moveTo(x, jy);
      else ctx.lineTo(x, jy);
    }
    ctx.stroke();
  }

  return toTexture(c, [1, 1]);
}

export function genNormalMap(
  heightCanvas: HTMLCanvasElement,
  strength = 2.5
): THREE.Texture {
  const size = heightCanvas.width;
  const hctx = heightCanvas.getContext('2d')!;
  const hData = hctx.getImageData(0, 0, size, size).data;

  const [nc, nctx] = canvas(size);
  const nImg = nctx.createImageData(size, size);
  const nd = nImg.data;

  const idx = (x: number, y: number) => {
    x = Math.max(0, Math.min(size - 1, x));
    y = Math.max(0, Math.min(size - 1, y));
    return (y * size + x) * 4;
  };
  const h = (x: number, y: number) => hData[idx(x, y)] / 255;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      nd[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      nd[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      nd[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      nd[i + 3] = 255;
    }
  }
  nctx.putImageData(nImg, 0, 0);
  const tex = new THREE.CanvasTexture(nc);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function genRoughnessMap(seed = 1, base = 0.85, variance = 0.12): THREE.Texture {
  const size = 512;
  const [c, ctx] = canvas(size);
  const noise = makeValueNoise(seed * 7 + 1);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n = noise(x * 0.1, y * 0.1);
      const v = Math.max(0, Math.min(1, base + (n - 0.5) * variance * 2)) * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toDataTexture(c);
}
