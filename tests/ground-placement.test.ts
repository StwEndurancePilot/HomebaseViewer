import { expect, it } from 'vitest';
import * as THREE from 'three';
import { groundSupport, surfaceSupport } from '../src/core/placement-target';
import { buildingRecord, unrealRotator } from '../src/core/editor';
import { Viewer, type PlacementHit } from '../src/scene/viewer';
import { WALKABLE } from '../src/penny/walk';
import { EDIT_PATTERNS, editStructure } from '../src/core/build-pieces';

it('targets the window opening ahead of builds behind it and respects closer obstructions', () => {
  const s = scene(),
    wall = editStructure(
      buildingRecord('wall', 2, 3, {
        translation: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      }),
      EDIT_PATTERNS.find((p) => p.id === 'WindowC')!,
    );
  s.viewer.placementRecords = [wall];
  s.viewer.camera.position.set(2, 192 / 512, 0);
  s.viewer.camera.lookAt(0, 192 / 512, 0);
  const behind = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  behind.rotation.y = Math.PI / 2;
  behind.position.set(-1, 192 / 512, 0);
  const backWall = { ...wall, actorPath: 'behind' };
  behind.userData.records = [backWall];
  s.builds.add(behind);
  expect(s.hit()?.record).toBe(wall);
  s.viewer.hiddenActors.add(wall.actorPath);
  expect(s.hit()?.record).toBe(backWall);
  s.viewer.hiddenActors.clear();
  behind.position.x = 1;
  expect(s.hit()?.record).toBe(backWall);
});

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
    scenery = new THREE.Group(),
    builds = new THREE.Group();
  const viewer = Object.assign(Object.create(Viewer.prototype), {
    camera,
    scene: new THREE.Scene().add(terrain, scenery, builds),
    terrain,
    scenery,
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
  return { terrain, scenery, builds, viewer, hit, plane };
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

it('targets building scenery above terrain and ignores hidden scenery', () => {
  const s = scene('pve_03');
  s.terrain.add(s.plane(0));
  const roof = s.plane(3);
  roof.name = 'FORT_LogCabin_Roof2';
  s.scenery.add(roof);
  expect(s.hit()?.point[2]).toBeCloseTo(1536);
  s.scenery.visible = false;
  expect(s.hit()?.point[2]).toBeCloseTo(0);
});

it('targets tunnel ceilings and walls, without turning water into a support', () => {
  const s = scene('pve_03');
  const ceiling = s.plane(6);
  ceiling.name = 'S_Cave_Tunnel_Straight';
  s.terrain.add(ceiling);
  s.viewer.camera.lookAt(0, 6, 0);
  expect(s.hit()?.point[2]).toBeCloseTo(3072);
  ceiling.rotation.x = 0;
  ceiling.position.set(0, 5, -2);
  s.viewer.camera.lookAt(0, 5, -2);
  expect(s.hit()?.point[0]).toBeCloseTo(1024);
  expect(Math.abs(s.hit()!.normal![0])).toBeCloseTo(1);
  ceiling.name = 'S_Water_Shallow_3x3';
  ceiling.userData[WALKABLE] = false;
  expect(s.hit()).toBeNull();
});

it('returns captured world supports when picking their rendered mesh', () => {
  const s = scene('pve_03');
  const mesh = s.plane(3);
  const record = buildingRecord('floor', 2, 3, {
    translation: [0, 0, 1536],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  });
  record.captureRole = 'existing-world';
  mesh.userData.records = [record];
  s.builds.add(mesh);
  expect(s.hit()?.record).toBe(record);
  record.captureRole = 'unavailable';
  expect(s.hit()).toBeNull();
});

it('snaps both horizontal and vertical map surfaces to building tiles', () => {
  expect(surfaceSupport([1100, 700, 770], [0, 0, -1], []).transform.translation).toEqual([
    1024, 512, 768,
  ]);
  const wall = surfaceSupport([1280, 700, 500], [1, 0, 0], []);
  expect(wall.buildingType).toBe(0);
  expect(wall.transform.translation).toEqual([1280, 768, 384]);
  const negative = surfaceSupport([-256, -100, -10], [-1, 0, 0], []);
  expect(negative.transform.translation).toEqual([-256, -256, -384]);
});
