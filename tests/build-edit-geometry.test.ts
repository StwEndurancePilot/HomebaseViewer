import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DoubleSide, Mesh, Raycaster, Vector3 } from 'three';
import { EDIT_PATTERNS } from '../src/core/build-pieces';
it('matches edit-grid orientation to the actual shipped wall and floor meshes', async () => {
  const b = readFileSync('assets/outpost-game/builds/builds.glb'),
    length = b.readUInt32LE(12),
    j = JSON.parse(b.subarray(20, 20 + length).toString());
  for (const m of j.meshes) for (const p of m.primitives) delete p.material;
  j.materials = [];
  j.images = [];
  j.textures = [];
  let json = Buffer.from(JSON.stringify(j));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)]);
  const bin = b.subarray(28 + length),
    out = Buffer.alloc(28 + json.length + bin.length);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(json.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  json.copy(out, 20);
  out.writeUInt32LE(bin.length, 20 + json.length);
  out.writeUInt32LE(0x004e4942, 24 + json.length);
  bin.copy(out, 28 + json.length);
  const model = await new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .parseAsync(out.buffer as ArrayBuffer, '');
  model.scene.updateMatrixWorld(true);
  for (const shape of ['DoorSide', 'Brace', 'RoofWall', 'BalconyO', 'BalconyI', 'BalconyS']) {
    const node = model.scene.children.find((n) => n.name === 'M1_' + shape)!;
    node.traverse((o) => {
      if (o instanceof Mesh && !Array.isArray(o.material)) o.material.side = DoubleSide;
    });
    const pattern = EDIT_PATTERNS.find((p) => p.id === shape)!,
      wall = pattern.kind === 'wall',
      width = wall ? 3 : 2,
      actual: number[] = [];
    for (let row = 0; row < width; row++)
      for (let column = 0; column < width; column++) {
        let hits = 0;
        for (const dx of [-20, 0, 20])
          for (const dy of [-20, 0, 20]) {
            const x = -256 + ((column + 0.5) * 512) / width + dx,
              y = wall ? -512 : ((row + 0.5) * 512) / width + dy,
              z = wall ? 384 - ((row + 0.5) * 384) / width + dy : 512;
            const ray = new Raycaster(
              new Vector3(y / 512, z / 512, -x / 512),
              wall ? new Vector3(1, 0, 0) : new Vector3(0, -1, 0),
              0,
              3,
            );
            if (ray.intersectObject(node, true).length) hits++;
          }
        actual.push(hits >= 3 ? 1 : 0);
      }
    expect(actual, `${shape}: selected cells must agree with native geometry`).toEqual(
      pattern.cells,
    );
  }
});
