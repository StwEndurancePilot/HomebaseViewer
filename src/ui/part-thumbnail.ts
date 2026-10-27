import * as THREE from 'three';
import { loadPrimaryBuildMeshes, loadPrimaryTrapMeshes } from '../penny/build-library';
import { meshIdentity } from '../core/mesh-identity';
import { sceneMatrix } from '../core/transforms';
import type { Placement } from '../core/save';
let renderer: THREE.WebGLRenderer | undefined;
const cache = new Map<string, Promise<string | null>>();
export function partThumbnail(records: Placement[]): Promise<string | null> {
  const key = JSON.stringify(records.map((p) => [p.meshPath, p.meshTransform]));
  const existing = cache.get(key);
  if (existing) return existing;
  const result = (async () => {
    const identities = records.map((p) => meshIdentity(p.meshPath));
    const builds = identities.some((i) => i?.library === 'build')
      ? await loadPrimaryBuildMeshes()
      : null;
    const traps = identities.some((i) => i?.library === 'trap')
      ? await loadPrimaryTrapMeshes()
      : null;
    const group = new THREE.Group();
    records.forEach((p, i) => {
      const identity = identities[i],
        parts = identity
          ? (identity.library === 'build' ? builds : traps)?.get(identity.key)
          : undefined;
      for (const part of parts ?? []) {
        const mesh = new THREE.Mesh(part.geometry, part.material);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(sceneMatrix(p.meshTransform));
        group.add(mesh);
      }
    });
    if (!group.children.length) return null;
    renderer ??= new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(480, 300);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    const scene = new THREE.Scene();
    scene.add(group, new THREE.HemisphereLight(0xecf4ff, 0x71819b, 3));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(3, 6, 4);
    scene.add(light);
    const box = new THREE.Box3().setFromObject(group),
      center = box.getCenter(new THREE.Vector3()),
      size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 0.15),
      camera = new THREE.PerspectiveCamera(34, 1.6, 0.01, 1000);
    camera.position.copy(center).add(new THREE.Vector3(1.65, 1.25, 1.8).multiplyScalar(span));
    camera.lookAt(center);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  })();
  cache.set(key, result);
  return result;
}
