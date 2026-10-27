import { expect, it } from 'vitest';
import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, Scene } from 'three';
import { Viewer } from '../src/scene/viewer';
import type { Placement } from '../src/core/save';
it('hides one record in a shared instanced mesh and restores exact matrices without changing saved poses', () => {
  const records = [0, 1].map((i) => ({
    actorPath: String(i),
    kind: 'trap',
    transform: { translation: [i * 512, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    meshTransform: { translation: [i * 512, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  })) as Placement[];
  const before = structuredClone(records),
    mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 2),
    traps = new Group();
  mesh.userData.records = records;
  mesh.setMatrixAt(0, new Matrix4().makeTranslation(10, 20, 30));
  mesh.setMatrixAt(1, new Matrix4().makeTranslation(40, 50, 60));
  traps.add(mesh);
  const original = Array.from(mesh.instanceMatrix.array);
  const viewer = Object.assign(Object.create(Viewer.prototype), {
    builds: new Group(),
    traps,
    markers: new Group(),
    scene: new Scene(),
    selectionIds: new Set(['0', '1']),
    issueActors: new Set(),
    issueBounds: new Map(),
    issueOverlays: new Group(),
    selectedBox: null,
  }) as Viewer;
  viewer.setHiddenActors(new Set(['0']));
  const matrix = new Matrix4();
  mesh.getMatrixAt(0, matrix);
  expect(matrix.determinant()).toBe(0);
  mesh.getMatrixAt(1, matrix);
  expect(matrix.elements.slice(12, 15)).toEqual([40, 50, 60]);
  expect(mesh.visible).toBe(true);
  expect(viewer.isFilteredOut('0')).toBe(true);
  expect(viewer.isFilteredOut('1')).toBe(false);
  viewer.setHiddenActors(new Set(['0', '1']));
  expect(mesh.visible).toBe(false);
  viewer.setHiddenActors(new Set());
  expect(mesh.visible).toBe(true);
  expect(Array.from(mesh.instanceMatrix.array)).toEqual(original);
  expect(records).toEqual(before);
});
