import { expect, it } from 'vitest';
import {
  attachment,
  buildingRecord,
  exportDiagnostics,
  placeStructure,
  placeTrap,
  placementConflict,
  selectionZDeltaRange,
  unrealRotator,
  ZERO_OFFSETS,
} from '../src/core/editor';
import { exportCapture, exportJson, exportSave } from '../src/core/export';
import { EditorDocument } from '../src/core/editor-document';
import { menuContainer } from '../src/cloud/convert';
import { parseCapture, type Capture, type Placement } from '../src/core/save';
import { sceneMatrix } from '../src/core/transforms';
import { worldSupportAt } from '../src/scene/world-support';
import { surfaceSupport } from '../src/core/placement-target';
import { relativePose } from '../src/core/editor';
import { mapSurfaceReference } from '../src/core/support';

function fixture() {
  const support = buildingRecord('floor', 2, 3, {
    translation: [1024, -512, 768],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  });
  support.captureRole = 'existing-world';
  const trap = placeTrap(
    {
      ...support,
      kind: 'trap',
      classPath: '/Game/Traps/Trap_Ceiling_Electric.Trap_Ceiling_Electric_C',
      meshPath: '/Game/Traps/SM_Electric.SM_Electric',
      itemPath: '/Game/Traps/TID_Ceiling_Electric.TID_Ceiling_Electric',
      attachmentType: 2,
    },
    support,
    0,
    1,
    ZERO_OFFSETS,
    'standard',
  );
  support.classPath = '/Game/Map/Tunnel.Tunnel_C';
  support.meshPath = '/Game/Map/S_Cave_Tunnel_Straight.S_Cave_Tunnel_Straight';
  support.resourceType = 255;
  support.savedActorGuid = '12345678901234567890123456789012';
  const data: Capture = {
    schemaVersion: 6,
    format: 'stw-homebase-capture',
    coordinateUnit: 'unreal-world-units',
    rotationEncoding: 'quaternion-xyzw',
    worldPath: 'Zone_Outpost_CannyValley',
    completeHomebase: false,
    placements: [support, trap],
  };
  return { support, trap, data };
}

it('retains referenced map structures and exact attachments through JSON export and reload', () => {
  const { support, trap, data } = fixture();
  const unrelated = { ...structuredClone(support), actorPath: 'unrelated', classPath: '' };
  data.placements.push(unrelated);
  const before = structuredClone(data);
  expect(exportDiagnostics(data)).toEqual([]);
  const exported = exportCapture(data);
  expect(exported.placements).toHaveLength(2);
  expect(exported.placements[0]).toMatchObject({
    actorPath: support.actorPath,
    captureRole: 'existing-world',
    savedActorGuid: support.savedActorGuid,
    transform: support.transform,
    meshTransform: support.meshTransform,
  });
  expect(attachment(exported.placements[1])).toEqual(attachment(trap));
  expect(parseCapture(new TextEncoder().encode(exportJson(data))).placements).toEqual(
    exported.placements,
  );
  expect(data).toEqual(before);
  expect(() => exportSave(menuContainer(), data)).toThrow(/valid existing map supports.*JSON/);
});

it('allows structures and traps on captured standard map pieces', () => {
  const { support } = fixture();
  const floor = {
    ...buildingRecord('floor', 0, 1, support.transform),
    captureRole: 'existing-world' as const,
  };
  expect(placeStructure(floor, 'wall', 'north', 2, 3).captureRole).toBe('placement');
});

it('moves, offsets, flips and undoes map-attached traps without moving their support', () => {
  const { support, trap, data } = fixture();
  const doc = new EditorDocument('Canny Valley', data, null);
  doc.selected.add(trap.actorPath);
  expect(selectionZDeltaRange([trap], data.placements)).toEqual([-Infinity, Infinity]);
  doc.offsetSelected({ position: [0, 0, 40], angles: [0, 0, 0] });
  doc.flipSelectedCeilings();
  doc.moveSelected([512, 0, 0]);
  expect(doc.data.placements[0]).toBe(support);
  expect(doc.data.placements[1].transform.translation).toEqual([1536, -512, 808]);
  expect(attachment(doc.data.placements[1])?.supportActorPath).toBe(support.actorPath);
  expect(exportDiagnostics(doc.data)).toEqual([]);
  doc.undo();
  doc.undo();
  doc.undo();
  expect(doc.data.placements[1]).toEqual(trap);
  doc.selected = new Set([support.actorPath]);
  expect(() => doc.moveSelected([512, 0, 0])).toThrow(/Only player-built/);
  expect(() => doc.deleteSelected()).toThrow(/Fixed world/);
});

it('allows multiple tiles on one map actor but still rejects exact duplicate traps', () => {
  const { support, trap, data } = fixture();
  const next = structuredClone(trap);
  next.actorPath = 'another-trap';
  next.transform.translation[0] += 512;
  expect(placementConflict(next, data.placements)).toBeNull();
  next.transform.translation = [1280, -256, 768];
  next.transform.rotation = unrealRotator(0, 90, 0);
  expect(placementConflict(next, data.placements)).toMatch(/support face already/);
  next.transform = structuredClone(trap.transform);
  expect(placementConflict(next, [support, trap])).toMatch(/already occupies/);
});

it('continues rejecting missing, unavailable and malformed map dependencies', () => {
  const { support, trap, data } = fixture();
  const codes = () => exportDiagnostics(data).map((issue) => issue.code);
  support.captureRole = 'unavailable';
  expect(codes()).toContain('missing-support');
  support.captureRole = 'existing-world';
  support.transform.scale[0] = 0;
  expect(codes()).toContain('zero-scale-support');
  support.transform.scale[0] = 1;
  support.meshTransform.rotation = [0, 0, 0, 0];
  expect(codes()).toContain('invalid-transform');
  data.placements = [trap];
  expect(codes()).toContain('missing-support');
});

it('matches static map geometry only to a unique captured mesh and pose', () => {
  const { support } = fixture();
  const matrix = sceneMatrix(support.meshTransform);
  expect(worldSupportAt('S_Cave_Tunnel_Straight', matrix, [support])).toBe(support);
  expect(worldSupportAt('some-other-mesh', matrix, [support])).toBeNull();
  const duplicate: Placement = { ...support, actorPath: 'duplicate' };
  expect(worldSupportAt('S_Cave_Tunnel_Straight', matrix, [support, duplicate])).toBeNull();
  matrix.elements[12] += 1;
  expect(worldSupportAt('S_Cave_Tunnel_Straight', matrix, [support])).toBeNull();
});

it('creates a persistent editor reference for a new trap on a bundled tunnel', () => {
  const { trap: template, data } = fixture();
  data.placements = [];
  const matrix = sceneMatrix({
    translation: [2048, -1024, 768],
    rotation: unrealRotator(0, 90, 0),
    scale: [-1, 2, 1],
  });
  const support = worldSupportAt('S_Cave_Tunnel_Straight', matrix, [], 'pve_03')!;
  expect(mapSurfaceReference(support)).toEqual({
    source: 'bundled-map',
    zoneId: 'pve_03',
    meshName: 'S_Cave_Tunnel_Straight',
  });
  sceneMatrix(support.transform).elements.forEach((v, i) =>
    expect(v).toBeCloseTo(matrix.elements[i], 9),
  );
  expect(worldSupportAt('S_Cave_Tunnel_Straight', matrix, [], 'pve_03')?.actorPath).toBe(
    support.actorPath,
  );
  const tile = surfaceSupport([2048, -1024, 768], [0, 0, -1], []);
  const trap = placeTrap(template, tile, 0, 1, ZERO_OFFSETS, 'standard');
  trap.attachment = {
    ...attachment(trap),
    supportActorPath: support.actorPath,
    supportTransform: structuredClone(support.transform),
    relativeTransform: relativePose(trap.transform, support.transform),
  };
  const doc = new EditorDocument('Canny Valley', data, null);
  doc.add(trap, support);
  expect(doc.data.placements).toHaveLength(2);
  expect(exportDiagnostics(doc.data)).toEqual([]);
  const restored = parseCapture(new TextEncoder().encode(exportJson(doc.data)));
  expect(worldSupportAt('S_Cave_Tunnel_Straight', matrix, restored.placements, 'pve_03')).toEqual(
    restored.placements[0],
  );
  doc.undo();
  expect(doc.data.placements).toEqual([]);
  doc.redo();
  expect(doc.data.placements).toHaveLength(2);
  expect(() => doc.add({ ...trap, actorPath: 'duplicate' }, support)).toThrow(/already occupies/);
  expect(doc.data.placements).toHaveLength(2);
  doc.data.worldPath = 'Zone_Outpost_Stonewood';
  expect(exportDiagnostics(doc.data).map((issue) => issue.code)).toContain('invalid-map-support');
});

it('does not fabricate map actor references for water, props or unknown zones', () => {
  const { support } = fixture();
  const matrix = sceneMatrix(support.transform);
  for (const name of [
    'S_Water_Shallow_3x3',
    'ARI_Arid_Tree_01',
    'SM_Prop_Ranger_Lightpost_alternate',
  ])
    expect(worldSupportAt(name, matrix, [], 'pve_03')).toBeNull();
  expect(worldSupportAt('S_Cave_Tunnel_Straight', matrix, [], 'unknown')).toBeNull();
});
