import { expect, it } from 'vitest';
import * as THREE from 'three';
import { groundSupport } from '../src/core/placement-target';
import { buildingRecord, unrealRotator } from '../src/core/editor';
import { Viewer, type PlacementHit } from '../src/scene/viewer';
import { WALKABLE } from '../src/penny/walk';

it('snaps an empty blueprint to tiles, including negative coordinates', () => {
  expect(groundSupport([1100, 700, 390], []).transform.translation).toEqual([1024, 512, 384]);
  expect(groundSupport([-600, -50, 0], []).transform.translation).toEqual([-512, -512, 0]);
});

it('aligns terrain placements with the captured grid and rotation', () => {
  const reference = buildingRecord('floor', 2, 3, {
    translation: [100.125, -200.75, 50.5],
    rotation: unrealRotator(0, 90, 0),
    scale: [1, 1, 1],
  });
  const point = new THREE.Vector3(550, 700, 380)
    .applyQuaternion(new THREE.Quaternion(...reference.transform.rotation))
    .add(new THREE.Vector3(...reference.transform.translation));
  const support = groundSupport(point.toArray(), [reference]);
  const local = new THREE.Vector3(...support.transform.translation)
    .sub(new THREE.Vector3(...reference.transform.translation))
    .applyQuaternion(new THREE.Quaternion(...reference.transform.rotation).invert());
  local.toArray().forEach((v, i) => expect(v).toBeCloseTo([512, 512, 384][i], 7));
});

function scene(zone: string | null = 'pve_01') {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.02, 100);
  camera.position.set(0, 5, 0);
  camera.lookAt(0, 0, 0);
  const terrain = new THREE.Group(),
    builds = new THREE.Group();
  const viewer = Object.assign(Object.create(Viewer.prototype), {
    camera,
    scene: new THREE.Scene().add(terrain, builds),
    terrain,
    builds,
    renderer: {
      domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) },
    },
    mode: 'orbit',
    environmentZone: zone,
    placementRecords: [],
    hiddenActors: new Set(),
  });
  const hit = () => viewer.placementHit(50, 50) as PlacementHit | null;
  const plane = (height: number, walkable = true) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = height;
    mesh.userData[WALKABLE] = walkable;
    return mesh;
  };
  return { terrain, builds, viewer, hit, plane };
}

it('targets bare terrain and respects terrain occlusion and unbuildable water', () => {
  const s = scene();
  const ground = s.plane(1);
  s.terrain.add(ground);
  expect(s.hit()?.record).toBeNull();
  expect(s.hit()?.point[2]).toBeCloseTo(512);
  ground.userData[WALKABLE] = false;
  expect(s.hit()).toBeNull();
  ground.userData[WALKABLE] = true;
  const build = s.plane(0);
  const record = buildingRecord('floor', 2, 3, {
    translation: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  });
  build.userData.records = [record];
  s.builds.add(build);
  expect(s.hit()?.record).toBeNull();
  build.position.y = 2;
  expect(s.hit()?.record).toBe(record);
});

it('provides a ground plane for custom blueprints but never fills gaps in real terrain', () => {
  expect(scene().hit()).toBeNull();
  const s = scene(null);
  expect(s.hit()?.record).toBeNull();
  expect(s.hit()?.point[2]).toBeCloseTo(0);
  s.viewer.camera.lookAt(0, 10, 0);
  expect(s.hit()).toBeNull();
});
