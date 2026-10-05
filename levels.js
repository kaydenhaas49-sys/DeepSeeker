// levels.js — planned level architecture for Backrooms: Lost Signal.
// The current playable build still runs APARTMENT + BACKROOMS. These definitions
// keep future levels centralized so the level transition system can be added
// without hardcoding names throughout main.js.

export const LEVELS = [
  {
    id: "apartment",
    name: "APARTMENT",
    type: "imported",
    description: "The normal world. The last place that feels familiar.",
    depth: 0
  },
  {
    id: "level-0",
    name: "LEVEL 0 · YELLOW",
    type: "procedural",
    profile: "classic",
    description: "The first Backrooms layer: yellow walls, carpet and endless fluorescent corridors.",
    depth: 0
  },
  {
    id: "level-1",
    name: "LEVEL 1 · SERVICE",
    type: "procedural",
    profile: "service",
    description: "A harsher industrial layer built around storage, maintenance and concrete service spaces.",
    depth: 1
  },
  {
    id: "level-2",
    name: "LEVEL 2 · MAINTENANCE",
    type: "procedural",
    profile: "maintenance",
    description: "Narrower routes, exposed infrastructure and heavier electrical noise.",
    depth: 2
  },
  {
    id: "level-3",
    name: "LEVEL 3 · DEEP ZONE",
    type: "procedural",
    profile: "deep",
    description: "The architecture begins to stop behaving like a building.",
    depth: 3
  },
  {
    id: "the-bottom",
    name: "THE BOTTOM",
    type: "setpiece",
    profile: "bottom",
    description: "The final descent. This should be a controlled set piece rather than ordinary chunk generation.",
    depth: 4
  }
];

export function getLevelDefinition(id){
  return LEVELS.find(level=>level.id===id) || LEVELS[1];
}

export function getNextLevelId(id){
  const index=LEVELS.findIndex(level=>level.id===id);
  if(index<0 || index>=LEVELS.length-1) return null;
  return LEVELS[index+1].id;
}
