import pve01 from './outpost-zones/pve_01.json';
import pve02 from './outpost-zones/pve_02.json';
import pve03 from './outpost-zones/pve_03.json';
import pve04 from './outpost-zones/pve_04.json';
export type OutpostZoneTerrain = {
  bounds: {
    maxX: number;
    maxY: number;
    minX: number;
    minY: number;
  };
  cell: number;
  floors: Array<Array<number>>;
  lava: Array<Array<number>>;
  props: Array<Array<number>>;
  rocks: Array<Array<number>>;
  shore: Array<Array<number>>;
  source: string;
  spawn: Array<number> | null;
  stormShield?: Array<number> | null;
  amplifiers?: Array<Array<number>>;
  waterZ: number;
  zoneId: string;
};
export const OUTPOST_ZONE_TERRAIN: Record<string, OutpostZoneTerrain> = {
  pve_01: pve01 as OutpostZoneTerrain,
  pve_02: pve02 as OutpostZoneTerrain,
  pve_03: pve03 as OutpostZoneTerrain,
  pve_04: pve04 as OutpostZoneTerrain,
};
