import { Quaternion, Vector3 } from 'three';
import catalog from '../data/build-edits.json';
import type { Placement, Pose } from './save';
export type BuildKind = 'wall' | 'floor' | 'stair' | 'roof';
export type EditPattern = {
  id: string;
  kind: BuildKind;
  label: string;
  cells: number[];
};
export const EDIT_PATTERNS = catalog.patterns as EditPattern[];
const definitions = new Map(catalog.definitions.map((d) => [d.classPath.toLowerCase(), d]));
export const buildDefinition = (p: Placement) =>
  p.kind === 'structure'
    ? definitions.get(p.classPath.toLowerCase().replace(/^\/savetheworld\//, '/game/'))
    : undefined;
export const patternOf = (p: Placement) =>
  EDIT_PATTERNS.find((v) => v.id === buildDefinition(p)?.shape);
export const structureKind = (p: Placement): BuildKind | undefined => patternOf(p)?.kind;
export function definitionFor(pattern: string, material: number, tier: number) {
  const def = catalog.definitions.find(
    (d) => d.shape === pattern && d.material === material && d.tier === tier,
  );
  if (!def) throw new Error('This edit has no verified mesh for this material and tier.');
  return def;
}
export function mirrorCells(cells: number[], width: number) {
  return cells.map((_, i) => cells[Math.floor(i / width) * width + width - 1 - (i % width)]);
}
export function rotateCells(cells: number[]) {
  return [cells[2], cells[0], cells[3], cells[1]];
}
export function matchEdit(
  kind: BuildKind,
  cells: number[],
): {
  pattern: EditPattern;
  turn: number;
  mirror: boolean;
} | null {
  for (const pattern of EDIT_PATTERNS.filter((p) => p.kind === kind)) {
    for (const mirror of [false, true]) {
      let values = mirror ? mirrorCells(pattern.cells, kind === 'wall' ? 3 : 2) : pattern.cells;
      for (let turn = 0; turn < (kind === 'wall' ? 1 : 4); turn++) {
        if (values.every((v, i) => v === cells[i])) return { pattern, turn: turn * 90, mirror };
        values = rotateCells(values);
      }
    }
  }
  return null;
}
export function editStructure(
  source: Placement,
  pattern: EditPattern,
  turn = 0,
  mirror = Boolean(source.mirrored),
): Placement {
  const old = buildDefinition(source),
    kind = structureKind(source);
  if (source.captureRole !== 'placement' || !old || kind !== pattern.kind)
    throw new Error('Select a supported player-built piece.');
  if (
    source.transform.scale.some((v) => Math.abs(Math.abs(v) - 1) > 1e-6) ||
    source.transform.scale[1] < 0 ||
    source.transform.scale[2] < 0
  )
    throw new Error('This piece has a custom scale. Copy it to preserve its transform.');
  if (!Number.isFinite(turn) || turn % 90 !== 0)
    throw new Error('Use quarter turns for building edits.');
  const def = definitionFor(pattern.id, old.material, old.tier),
    result = structuredClone(source);
  const before = new Quaternion(...source.transform.rotation),
    after = before
      .clone()
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), (turn * Math.PI) / 180));
  const origin = new Vector3(...source.transform.translation);
  if (kind !== 'wall')
    origin
      .add(new Vector3(0, 256, 0).applyQuaternion(before))
      .sub(new Vector3(0, 256, 0).applyQuaternion(after));
  const pose: Pose = {
    translation:
      turn % 360 === 0
        ? [...source.transform.translation]
        : (origin.toArray() as Pose['translation']),
    rotation:
      turn % 360 === 0 ? [...source.transform.rotation] : (after.toArray() as Pose['rotation']),
    scale: [mirror ? -1 : 1, 1, 1],
  };
  result.classPath = def.classPath;
  result.meshPath = def.meshPath;
  result.transform = pose;
  result.meshTransform = structuredClone(pose);
  result.mirrored = mirror;
  result.buildingType = { wall: 0, floor: 1, stair: 5, roof: 6 }[kind];
  return result;
}
