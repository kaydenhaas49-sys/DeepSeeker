// ============================================================================
// assetLoader.ts — Loads GLTF models and textures with graceful fallback.
// Uses Three.js examples loaders. Falls back to procedural textures when
// files are missing so the game always runs.
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ASSET_MANIFEST, type GLTFAssetEntry, type TextureAssetEntry } from './assetManifest';
import {
  genWallpaper,
  genCarpet,
  genCeiling,
  genPage,
} from './textureGenerator';

export interface TextureSet {
  color: THREE.Texture | null;
  normal: THREE.Texture | null;
  roughness: THREE.Texture | null;
}

export interface LoadedAssets {
  entityModel: THREE.Object3D | null;
  textures: {
    wallpaper: TextureSet;
    carpet: TextureSet;
    ceiling: TextureSet;
    page: TextureSet;
  };
}

export interface LoadProgress {
  progress: number;
  label: string;
}

type ProgressCb = (p: LoadProgress) => void;

export async function loadAllAssets(onProgress?: ProgressCb): Promise<LoadedAssets> {
  const report = (progress: number, label: string) => {
    onProgress?.({ progress, label });
  };

  report(0.05, 'Initializing loaders...');

  let entityModel: THREE.Object3D | null = null;
  try {
    const entry = ASSET_MANIFEST.entity as GLTFAssetEntry;
    entityModel = await loadGLTF(entry.url, entry.scale ?? 1);
    report(0.3, 'Entity model loaded.');
  } catch {
    report(0.3, 'Using procedural entity.');
  }

  report(0.35, 'Loading textures...');

  const wallpaperColor = await tryLoadTexture(
    (ASSET_MANIFEST.wallpaper as TextureAssetEntry).url,
    ASSET_MANIFEST.wallpaper.repeat
  ).catch(() => genWallpaper());
  report(0.5, 'Wallpaper ready.');

  const carpetColor = await tryLoadTexture(
    (ASSET_MANIFEST.carpet as TextureAssetEntry).url,
    ASSET_MANIFEST.carpet.repeat
  ).catch(() => genCarpet());
  report(0.65, 'Carpet ready.');

  const ceilingColor = await tryLoadTexture(
    (ASSET_MANIFEST.ceilingTile as TextureAssetEntry).url,
    ASSET_MANIFEST.ceilingTile.repeat
  ).catch(() => genCeiling());
  report(0.8, 'Ceiling ready.');

  const pageColor = await tryLoadTexture(
    (ASSET_MANIFEST.page as TextureAssetEntry).url,
    ASSET_MANIFEST.page.repeat
  ).catch(() => genPage());
  report(0.95, 'Pages ready.');

  report(1.0, 'Ready.');

  return {
    entityModel,
    textures: {
      wallpaper: { color: wallpaperColor, normal: null, roughness: null },
      carpet: { color: carpetColor, normal: null, roughness: null },
      ceiling: { color: ceilingColor, normal: null, roughness: null },
      page: { color: pageColor, normal: null, roughness: null },
    },
  };
}

function loadGLTF(url: string, scale: number): Promise<THREE.Object3D> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(scale);
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        resolve(model);
      },
      undefined,
      (err) => reject(err)
    );
  });
}

async function tryLoadTexture(
  url: string,
  repeat: [number, number] = [1, 1]
): Promise<THREE.Texture> {
  // Pre-check: Vite dev server returns index.html (200 OK) for missing assets,
  // which causes Three.js TextureLoader to hang forever trying to decode HTML
  // as an image. Reject early if the response isn't actually an image.
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok || !contentType.startsWith('image/')) {
      throw new Error(`Not an image: ${url} (${contentType})`);
    }
  } catch {
    throw new Error(`Fetch failed for: ${url}`);
  }

  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    const timeout = setTimeout(() => {
      reject(new Error(`Texture load timed out: ${url}`));
    }, 5000);

    loader.load(
      url,
      (tex) => {
        clearTimeout(timeout);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeat[0], repeat[1]);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        resolve(tex);
      },
      undefined,
      (err) => {
        clearTimeout(timeout);
        reject(err);
      }
    );
  });
}
