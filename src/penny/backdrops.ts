import * as THREE from 'three';
import { keepFoliageNormals } from './atmosphere';
import { loadTexturedLibrary } from './build-library';
import { WALKABLE } from './walk';
import outpostSkyboxUrl from '../../assets/outpost-game/backdrops/Skybox_Outpost.glb?url';
import homebaseSkyboxUrl from '../../assets/outpost-game/backdrops/Skybox_Outpost_HomeBase.glb?url';
import cannySkyboxUrl from '../../assets/outpost-game/backdrops/Zone_Outpost_CannyValley_Skybox.glb?url';
import stonewoodSceneryUrl from '../../assets/outpost-game/zones/pve_01/scenery.glb?url';
import plankertonSceneryUrl from '../../assets/outpost-game/zones/pve_02/scenery.glb?url';
import cannySceneryUrl from '../../assets/outpost-game/zones/pve_03/scenery.glb?url';
import twineSceneryUrl from '../../assets/outpost-game/twine/scenery.glb?url';
type Backdrop = {
  url: string;
  placements: () => Promise<Array<Array<number | string>>>;
};
const outpost: Backdrop = {
  placements: () =>
    import('../../assets/outpost-game/backdrops/Skybox_Outpost.json').then(
      (m) => m.default.placements,
    ),
  url: outpostSkyboxUrl,
};
const homebase: Backdrop = {
  placements: () =>
    import('../../assets/outpost-game/backdrops/Skybox_Outpost_HomeBase.json').then(
      (m) => m.default.placements,
    ),
  url: homebaseSkyboxUrl,
};
const canny: Backdrop = {
  placements: () =>
    import('../../assets/outpost-game/backdrops/Zone_Outpost_CannyValley_Skybox.json').then(
      (m) => m.default.placements,
    ),
  url: cannySkyboxUrl,
};
const ZONE_BACKDROPS: Record<string, Array<Backdrop>> = {
  pve_01: [outpost, homebase],
  pve_02: [outpost],
  pve_03: [canny],
  pve_04: [outpost],
};
const hazedMaterials = new WeakMap<THREE.Material, THREE.Material>();
function hazed(source: THREE.Material) {
  let material = hazedMaterials.get(source);
  if (!material) {
    const copy = source.clone() as THREE.MeshStandardMaterial;
    if (!copy.map) {
      copy.color.set(0x2f2c40);
      copy.roughness = 1;
    }
    copy.fog = false;
    copy.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <fog_fragment>',
        'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.55, 0.64, 0.74), 0.22);\n#include <fog_fragment>',
      );
    };
    copy.customProgramCacheKey = () => 'backdrop-haze';
    material = copy;
    hazedMaterials.set(source, material);
  }
  return material;
}
const ZONE_SCENERY: Record<string, Backdrop> = {
  pve_01: {
    placements: () =>
      import('../../assets/outpost-game/zones/pve_01/scenery.json').then(
        (m) => m.default.placements,
      ),
    url: stonewoodSceneryUrl,
  },
  pve_02: {
    placements: () =>
      import('../../assets/outpost-game/zones/pve_02/scenery.json').then(
        (m) => m.default.placements,
      ),
    url: plankertonSceneryUrl,
  },
  pve_03: {
    placements: () =>
      import('../../assets/outpost-game/zones/pve_03/scenery.json').then(
        (m) => m.default.placements,
      ),
    url: cannySceneryUrl,
  },
  pve_04: {
    placements: () =>
      import('../../assets/outpost-game/twine/scenery.json').then((m) => m.default.placements),
    url: twineSceneryUrl,
  },
};
export function hasZoneScenery(zoneId: string | undefined) {
  return Boolean(zoneId && ZONE_SCENERY[zoneId]);
}
export function addZoneScenery(zoneId: string, group: THREE.Group, isDisposed: () => boolean) {
  const scenery = ZONE_SCENERY[zoneId];
  return scenery ? placeBackdrops([scenery], group, isDisposed, false) : Promise.resolve();
}
export function addZoneBackdrops(zoneId: string, group: THREE.Group, isDisposed: () => boolean) {
  return placeBackdrops(ZONE_BACKDROPS[zoneId] ?? [], group, isDisposed, true);
}
const foliageMaterials = new WeakMap<THREE.Material, THREE.Material>();
function foliage(source: THREE.Material) {
  let material = foliageMaterials.get(source);
  if (!material) {
    material = source.clone();
    if ((material as THREE.MeshStandardMaterial).alphaTest > 0) {
      material.side = THREE.DoubleSide;
      keepFoliageNormals(material);
    }
    foliageMaterials.set(source, material);
  }
  return material;
}
function placeBackdrops(
  backdrops: Array<Backdrop>,
  group: THREE.Group,
  isDisposed: () => boolean,
  distant: boolean,
) {
  return Promise.all(
    backdrops.map(async (backdrop) => {
      try {
        const [library, placements] = await Promise.all([
          loadTexturedLibrary(backdrop.url),
          backdrop.placements(),
        ]);
        if (isDisposed()) return;
        const byMesh = new Map<string, Array<Array<number>>>();
        for (const [mesh, ...matrix] of placements) {
          const key = String(mesh).toLowerCase();
          byMesh.set(key, [...(byMesh.get(key) ?? []), matrix as Array<number>]);
        }
        const matrix = new THREE.Matrix4();
        for (const [key, matrices] of byMesh) {
          for (const part of library.get(key) ?? []) {
            const material = distant ? hazed(part.material) : foliage(part.material);
            const mesh = new THREE.InstancedMesh(part.geometry, material, matrices.length);
            matrices.forEach((values, index) => mesh.setMatrixAt(index, matrix.fromArray(values)));
            mesh.computeBoundingSphere();
            mesh.castShadow = !distant;
            mesh.receiveShadow = !distant;
            if (!distant && !((material as THREE.MeshStandardMaterial).alphaTest > 0))
              mesh.userData[WALKABLE] = true;
            group.add(mesh);
          }
        }
      } catch {}
    }),
  ).then(() => undefined);
}
