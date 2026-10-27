import { afterEach, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshStandardMaterial, Vector3 } from 'three';
import { addZoneObjectives } from '../src/penny/objectives';
import { loadOutpostModels } from '../src/penny/build-library';
import { OUTPOST_ZONE_TERRAIN } from '../src/penny/zones';
import { sceneMatrix } from '../src/core/transforms';

vi.mock('../src/penny/build-library', () => ({ loadOutpostModels: vi.fn() }));
const parts = [{ geometry: new BoxGeometry(), material: new MeshStandardMaterial() }];
const library = new Map(
  ['stormshield', 'stormshieldtop', 'amplifier', 'amplifierfloor'].map((name) => [name, parts]),
);
afterEach(() => vi.resetAllMocks());

it.each(Object.entries(OUTPOST_ZONE_TERRAIN))(
  'renders the complete Storm Shield and every amplifier at native map poses in %s',
  async (zone, terrain) => {
    vi.mocked(loadOutpostModels).mockResolvedValue(library);
    const group = new Group();
    await addZoneObjectives(zone, group, () => false);
    expect(group.children).toHaveLength(4);
    for (const child of group.children) {
      const mesh = child as InstancedMesh;
      const poses = mesh.name.startsWith('stormshield')
        ? [terrain.stormShield!]
        : terrain.amplifiers!;
      expect(mesh.count).toBe(poses.length);
      expect(mesh.visible).toBe(true);
      expect(mesh.userData.records).toBeUndefined();
      expect(mesh.boundingSphere!.radius).toBeGreaterThan(0);
      poses.forEach(([x, y, z, yaw], index) => {
        const actual = new Matrix4();
        mesh.getMatrixAt(index, actual);
        const angle = (yaw * Math.PI) / 180 / 2;
        const expected = sceneMatrix({
          translation: [x * 512, y * 512, z * 512],
          rotation: [0, 0, Math.sin(angle), Math.cos(angle)],
          scale: [1, 1, 1],
        });
        for (const point of [new Vector3(), new Vector3(1, 0, 0)])
          expect(
            point.clone().applyMatrix4(actual).distanceTo(point.applyMatrix4(expected)),
          ).toBeLessThan(0.00001);
      });
      mesh.dispose();
    }
  },
);

it('does not add objectives from an obsolete map load', async () => {
  const group = new Group();
  let disposed = false;
  vi.mocked(loadOutpostModels).mockImplementation(async () => {
    disposed = true;
    return library;
  });
  await addZoneObjectives('pve_01', group, () => disposed);
  expect(group.children).toHaveLength(0);
});

it('leaves unknown zones empty without loading models', async () => {
  const group = new Group();
  await addZoneObjectives('unknown', group, () => false);
  expect(group.children).toHaveLength(0);
  expect(loadOutpostModels).not.toHaveBeenCalled();
});

it('reports missing objective assets instead of silently omitting them', async () => {
  vi.mocked(loadOutpostModels).mockResolvedValue(new Map());
  await expect(addZoneObjectives('pve_01', new Group(), () => false)).rejects.toThrow(
    'Missing outpost model: stormshield',
  );
});
