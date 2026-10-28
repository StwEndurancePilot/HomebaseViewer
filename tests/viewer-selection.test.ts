import { expect, it } from 'vitest';
import * as THREE from 'three';
import { Viewer } from '../src/scene/viewer';
import { buildingRecord } from '../src/core/editor';
import type { Placement } from '../src/core/save';
it('highlights trap supports without selecting them and clears stale highlights', () => {
  const support = buildingRecord('wall', 2, 3, {
    translation: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  });
  const trap: Placement = {
    ...structuredClone(support),
    actorPath: '/trap',
    kind: 'trap',
    attachment: { status: 'resolved', supportActorPath: support.actorPath },
  };
  const buildMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
    1,
  );
  const trapMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
    1,
  );
  buildMesh.userData.records = [support];
  trapMesh.userData.records = [trap];
  buildMesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(10, 0, 0));
  trapMesh.setMatrixAt(0, new THREE.Matrix4());
  const viewer = Object.assign(Object.create(Viewer.prototype), {
    scene: new THREE.Scene(),
    builds: new THREE.Group().add(buildMesh),
    traps: new THREE.Group().add(trapMesh),
    markers: new THREE.Group(),
    placementRecords: [support],
    hiddenActors: new Set(),
    issueActors: new Set(),
    issueBounds: new Map(),
    issueOverlays: new THREE.Group(),
    selectedBox: null,
  }) as Viewer;
  const color = (mesh: THREE.InstancedMesh) => {
    const c = new THREE.Color();
    mesh.getColorAt(0, c);
    return c.getHex();
  };
  viewer.setSelection(new Set([trap.actorPath]));
  expect(color(buildMesh)).toBe(0xffcd80);
  expect(color(trapMesh)).toBe(0x83baff);
  const box = viewer.scene.children.find((o) => o instanceof THREE.Box3Helper) as THREE.Box3Helper;
  expect(box.box.max.x).toBe(0.5);
  viewer.setSelection(new Set());
  expect(color(buildMesh)).toBe(0xffffff);
  expect(color(trapMesh)).toBe(0xffffff);
  expect(viewer.scene.children.some((o) => o instanceof THREE.Box3Helper)).toBe(false);
  viewer.setExportIssues(new Set([support.actorPath]));
  viewer.setSelection(new Set([trap.actorPath]));
  expect(color(buildMesh)).toBe(0xff3535);
  viewer.setExportIssues(new Set());
  trap.attachment = { status: 'unresolved', supportActorPath: support.actorPath };
  viewer.setSelection(new Set([trap.actorPath]));
  expect(color(buildMesh)).toBe(0xffffff);
  viewer.setSelection(new Set());
  for (const mesh of [buildMesh, trapMesh]) {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    mesh.dispose();
  }
});
