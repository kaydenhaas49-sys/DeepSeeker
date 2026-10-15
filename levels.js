// levels.js — planned level architecture for Backrooms: Lost Signal.
// Playable levels are centralized here so future transitions do not require hardcoding names throughout main.js.

export const LEVELS = [
  {
    id: "level-0",
    name: "LEVEL 0 · YELLOW",
    type: "procedural",
    profile: "classic",
    description: "Yellow walls, damp carpet, and buzzing lights.",
    depth: 0
  },
  {
    id: "level-run",
    name: "LEVEL RUN",
    type: "setpiece",
    profile: "industrial-run",
    description: "Find the code and open the safe before the spider catches you.",
    depth: 0.5
  },
  {
    id: "level-1",
    name: "LEVEL 1 · SERVICE",
    type: "procedural",
    profile: "service",
    description: "Concrete halls, storage rooms, and bad lighting.",
    depth: 1
  },
  {
    id: "level-2",
    name: "LEVEL 2 · MAINTENANCE",
    type: "procedural",
    profile: "maintenance",
    description: "Tight halls, exposed pipes, and loud wiring.",
    depth: 2
  },
  {
    id: "level-3",
    name: "LEVEL 3 · DEEP ZONE",
    type: "procedural",
    profile: "deep",
    description: "The halls stop making sense.",
    depth: 3
  },
  {
    id: "the-bottom",
    name: "THE BOTTOM",
    type: "setpiece",
    profile: "bottom",
    description: "The last way down.",
    depth: 4
  }
];

export function getLevelDefinition(id){
  return LEVELS.find(level=>level.id===id) || LEVELS[0];
}

export function getNextLevelId(id){
  const index=LEVELS.findIndex(level=>level.id===id);
  if(index<0 || index>=LEVELS.length-1) return null;
  return LEVELS[index+1].id;
}
