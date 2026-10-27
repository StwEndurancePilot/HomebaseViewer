import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { pennyTrapPivotOffset } from '../core/trap-pivots';
import buildsUrl from '../../assets/outpost-game/builds/builds.glb?url';
import outpostUrl from '../../assets/outpost-game/outpost/outpost.glb?url';
import trapsUrl from '../../assets/outpost-game/traps/traps.glb?url';
import recoveredTrapsUrl from '../../assets/outpost-game/recovered-traps/traps.glb?url';
export type BuildPart = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
};
const MATERIAL_LETTER = ['W', 'B', 'M'];
const libraries = new Map<string, Promise<Map<string, Array<BuildPart>>>>();
export function buildPieceKey(material: number, tier: number, shape: string) {
  const letter = MATERIAL_LETTER[material];
  if (!letter || !shape) return null;
  return `${letter}${Math.max(1, Math.min(3, tier || 1))}_${shape}`.toLowerCase();
}
export function loadTexturedLibrary(url: string, sourceMeshes = false) {
  const cacheKey = `${url}:${sourceMeshes}`;
  let pending = libraries.get(cacheKey);
  if (pending) return pending;
  pending = new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(url)
    .then((gltf) => {
      const library = new Map<string, Array<BuildPart>>();
      gltf.scene.updateMatrixWorld(true);
      for (const node of gltf.scene.children) {
        const parts: Array<BuildPart> = [];
        const sourceParts = new Map<string, Array<BuildPart>>();
        node.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const geometry = new THREE.BufferGeometry();
          const source = object.geometry as THREE.BufferGeometry;
          for (const [name, attribute] of Object.entries(source.attributes)) {
            const values = new Float32Array(attribute.count * attribute.itemSize);
            for (let index = 0; index < attribute.count; index++) {
              for (let component = 0; component < attribute.itemSize; component++) {
                values[index * attribute.itemSize + component] = attribute.getComponent(
                  index,
                  component,
                );
              }
            }
            geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
          }
          geometry.setIndex(source.index ? source.index.clone() : null);
          geometry.applyMatrix4(object.matrixWorld);
          const material = object.material as THREE.MeshStandardMaterial;
          if (material.userData.unrealNormalY) material.normalScale.y = -1;
          if (!material.metalnessMap) {
            material.roughness = 0.85;
            material.metalness = 0;
          } else {
            material.metalness = 0.75;
            material.onBeforeCompile = (shader) => {
              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <roughnessmap_fragment>',
                '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, 0.6);',
              );
            };
            material.customProgramCacheKey = () => 'game-metal-gloss';
          }
          parts.push({ geometry, material });
          if (sourceMeshes) {
            const association = gltf.parser.associations.get(object);
            const source =
              association?.meshes === undefined
                ? null
                : gltf.parser.json.meshes[association.meshes]?.name;
            if (typeof source === 'string') {
              const key = source.toLowerCase();
              if (url === trapsUrl) geometry.translate(...pennyTrapPivotOffset(key));
              const entries = sourceParts.get(key) ?? [];
              entries.push({ geometry, material });
              sourceParts.set(key, entries);
            }
          }
          geometry.computeBoundingSphere();
        });
        if (sourceMeshes) {
          for (const [key, entries] of sourceParts)
            if (!library.has(key)) library.set(key, entries);
        } else library.set(node.name.toLowerCase(), parts);
      }
      return library;
    })
    .catch((error) => {
      libraries.delete(cacheKey);
      throw error;
    });
  libraries.set(cacheKey, pending);
  return pending;
}
export function loadBuildLibrary() {
  return loadTexturedLibrary(buildsUrl);
}
let primaryTrapLibrary: Promise<Map<string, Array<BuildPart>>> | null = null;
export function loadPrimaryTrapMeshes() {
  primaryTrapLibrary ??= Promise.all([
    loadTexturedLibrary(trapsUrl, true),
    loadTexturedLibrary(recoveredTrapsUrl),
  ]).then(([penny, recovered]) => new Map([...penny, ...recovered]));
  return primaryTrapLibrary;
}
export function loadPrimaryBuildMeshes() {
  return loadTexturedLibrary(buildsUrl, true);
}
export function loadOutpostModels() {
  return loadTexturedLibrary(outpostUrl);
}
export function trapModelKey(displayName: string) {
  return displayName
    .replace(/\s/g, '_')
    .replace(/[[\].:/]/g, '')
    .toLowerCase();
}
let trapLibrary: Promise<Map<string, Array<BuildPart>>> | null = null;
export function loadTrapModels() {
  trapLibrary ??= loadTexturedLibrary(trapsUrl).then((nodes) => {
    const traps = new Map<string, Array<BuildPart>>();
    for (const [name, parts] of nodes) {
      const key = name.replace(/#\d+$/, '');
      traps.set(key, [...(traps.get(key) ?? []), ...parts]);
    }
    return traps;
  });
  return trapLibrary;
}
