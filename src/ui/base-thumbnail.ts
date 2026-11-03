import * as THREE from 'three';
import {
  loadPrimaryBuildMeshes,
  loadPrimaryTrapMeshes,
  type BuildPart,
} from '../penny/build-library';
import { meshIdentity } from '../core/mesh-identity';
import { sceneMatrix, scenePoint } from '../core/transforms';
import type { Placement } from '../core/save';

let renderer: THREE.WebGLRenderer | undefined;

export async function baseThumbnail(records: Placement[]): Promise<string> {
  const [builds, traps] = await Promise.all([loadPrimaryBuildMeshes(), loadPrimaryTrapMeshes()]);
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  const batches = new Map<string, { parts: BuildPart[]; records: Placement[]; signs: number[] }>();
  const resources: { dispose(): void }[] = [];
  const bounds = new THREE.Box3();
  try {
    for (const record of records) {
      if (record.captureRole !== 'placement') continue;
      const identity = meshIdentity(record.meshPath);
      const parts = identity && (identity.library === 'build' ? builds : traps).get(identity.key);
      const signs = [
        record.meshTransform.scale[1],
        record.meshTransform.scale[2],
        record.meshTransform.scale[0],
      ].map((v) => (v < 0 ? -1 : 1));
      if (!parts?.length) {
        const geometry = new THREE.OctahedronGeometry(0.1);
        const material = new THREE.MeshBasicMaterial({ color: 0xb56ba9, wireframe: true });
        resources.push(geometry, material);
        const marker = new THREE.Mesh(geometry, material);
        marker.position.copy(scenePoint(record.meshTransform.translation));
        group.add(marker);
        continue;
      }
      const key = `${identity!.library}:${identity!.key}:${signs}`;
      const batch = batches.get(key) ?? { parts, records: [], signs };
      batch.records.push(record);
      batches.set(key, batch);
    }
    for (const batch of batches.values()) {
      for (const part of batch.parts) {
        let geometry = part.geometry;
        if (batch.signs.some((s) => s < 0)) {
          geometry = geometry.clone();
          geometry.scale(batch.signs[0], batch.signs[1], batch.signs[2]);
          if (batch.signs[0] * batch.signs[1] * batch.signs[2] < 0) {
            if (!geometry.index)
              geometry.setIndex(
                Array.from({ length: geometry.getAttribute('position').count }, (_, i) => i),
              );
            const index = geometry.index!;
            for (let i = 0; i < index.count; i += 3) {
              const first = index.getX(i);
              index.setX(i, index.getX(i + 2));
              index.setX(i + 2, first);
            }
          }
          resources.push(geometry);
        }
        const material = part.material.clone();
        material.side = THREE.DoubleSide;
        const mesh = new THREE.InstancedMesh(geometry, material, batch.records.length);
        resources.push(material, mesh);
        batch.records.forEach((record, i) =>
          mesh.setMatrixAt(
            i,
            sceneMatrix({
              ...record.meshTransform,
              scale: record.meshTransform.scale.map(Math.abs) as [number, number, number],
            }),
          ),
        );
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();
        group.add(mesh);
      }
    }
    bounds.setFromObject(group);
    if (bounds.isEmpty())
      bounds.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(4, 0, 4));
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 1);
    group.position.sub(center);
    scene.add(group);
    const grid = new THREE.GridHelper(span * 1.4, 16, 0xa6b6cc, 0xc9d3e0);
    grid.position.y = bounds.min.y - center.y - 0.015;
    resources.push(
      grid.geometry,
      ...(Array.isArray(grid.material) ? grid.material : [grid.material]),
    );
    scene.add(grid, new THREE.HemisphereLight(0xecf4ff, 0x71819b, 3));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(3, 6, 4);
    scene.add(light);
    const camera = new THREE.PerspectiveCamera(34, 1.6, Math.max(span / 1000, 0.001), span * 20);
    const distance =
      (Math.max(size.length() / 2, 0.5) / Math.sin(THREE.MathUtils.degToRad(17))) * 1.08;
    camera.position.copy(new THREE.Vector3(1.15, 1, 1.4).normalize().multiplyScalar(distance));
    camera.lookAt(0, 0, 0);
    renderer ??= new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(480, 300);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0xe3eaf3, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/webp', 0.82);
  } finally {
    for (const resource of resources) resource.dispose();
  }
}
