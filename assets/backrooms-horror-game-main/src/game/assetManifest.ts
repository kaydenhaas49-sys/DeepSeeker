// ============================================================================
// assetManifest.ts — Central registry for all swappable assets.
// ============================================================================

export interface AssetEntry {
  url: string;
  label: string;
  optional?: boolean;
}

export interface GLTFAssetEntry extends AssetEntry {
  kind: 'gltf';
  scale?: number;
}

export interface TextureAssetEntry extends AssetEntry {
  kind: 'texture';
  resolution?: number;
  repeat?: [number, number];
}

export const ASSET_MANIFEST = {
  entity: {
    kind: 'gltf',
    url: '/assets/models/entity.glb',
    label: 'The Hunter',
    scale: 1,
    optional: true,
  } as GLTFAssetEntry,

  wallpaper: {
    kind: 'texture',
    url: '/assets/textures/wallpaper_color.jpg',
    label: 'Yellow Wallpaper',
    resolution: 1024,
    repeat: [1, 1],
  } as TextureAssetEntry,

  carpet: {
    kind: 'texture',
    url: '/assets/textures/carpet_color.jpg',
    label: 'Damp Carpet',
    resolution: 1024,
    repeat: [3, 3],
  } as TextureAssetEntry,

  ceilingTile: {
    kind: 'texture',
    url: '/assets/textures/ceiling_color.jpg',
    label: 'Ceiling Tile',
    resolution: 1024,
    repeat: [1, 1],
  } as TextureAssetEntry,

  page: {
    kind: 'texture',
    url: '/assets/textures/page_color.jpg',
    label: 'Lost Page',
    resolution: 512,
    repeat: [1, 1],
  } as TextureAssetEntry,
} as const;

export type AssetKey = keyof typeof ASSET_MANIFEST;

export const ALL_ASSETS = Object.entries(ASSET_MANIFEST).map(([key, entry]) => ({
  key: key as AssetKey,
  ...entry,
}));
