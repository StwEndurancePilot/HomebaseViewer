import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  loadPrimaryBuildMeshes,
  loadPrimaryTrapMeshes,
  type BuildPart,
} from '../penny/build-library';
import { createWalker, WALKABLE } from '../penny/walk';
import { createZoneTerrain } from '../penny/twine-terrain';
import { addZoneBackdrops, addZoneScenery } from '../penny/backdrops';
import { addZoneObjectives } from '../penny/objectives';
import { createSky, SUN_DIRECTION, HORIZON } from '../penny/atmosphere';
import { OUTPOST_ZONE_TERRAIN } from '../penny/zones';
import { sceneMatrix, scenePoint } from '../core/transforms';
import { meshIdentity } from '../core/mesh-identity';
import { pennyTrapPivotOffset } from '../core/trap-pivots';
import { zoneForCapture, type Capture, type Placement } from '../core/save';
import { attachment, type Vec3 } from '../core/editor';
import { structureKind } from '../core/build-pieces';
import { TrapMover } from './trap-mover';
export type PlacementHit = {
  record: Placement | null;
  point: Vec3;
  camera: Vec3;
};
export type FidelityReport = {
  file: string;
  records: number;
  rendered: number;
  unmatched: {
    actorPath: string;
    meshPath: string;
    reason: string;
  }[];
  unavailable: number;
  existingWorld: number;
  zone: string | null;
  completeHomebase: boolean;
  transformPolicy: string;
  limitations: string[];
  trapPivotCorrections: {
    records: number;
    localUnrealOffset: number[];
    meshes: string[];
  };
};
export class Viewer {
  readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.02, 4000);
  readonly controls: OrbitControls;
  readonly mover: TrapMover;
  readonly builds = new THREE.Group();
  readonly traps = new THREE.Group();
  readonly markers = new THREE.Group();
  readonly terrain = new THREE.Group();
  readonly scenery = new THREE.Group();
  readonly objectives = new THREE.Group();
  readonly backdrop = new THREE.Group();
  private resources: {
    dispose(): void;
  }[] = [];
  private environmentResources: {
    dispose(): void;
  }[] = [];
  private environmentZone: string | null | undefined = undefined;
  private previewGroup = new THREE.Group();
  private previewResources: {
    dispose(): void;
  }[] = [];
  private previewGeneration = 0;
  private placing = false;
  private editTarget: string | null = null;
  private editMatrices: {
    mesh: THREE.InstancedMesh;
    index: number;
    matrix: THREE.Matrix4;
  }[] = [];
  private placementRecords: Placement[] = [];
  private pointer: THREE.Vector2 | null = null;
  private hoverQueued = false;
  onPlacementHover: (hit: PlacementHit | null) => void = () => {};
  onPlacementClick: (hit: PlacementHit | null) => void = () => {};
  boxSelecting = false;
  private marquee = document.createElement('div');
  private permanent: {
    dispose(): void;
  }[] = [];
  private walker: ReturnType<typeof createWalker> | null = null;
  private mode: 'orbit' | 'walk' | 'fly' = 'orbit';
  private generation = 0;
  private spawn = new THREE.Vector3();
  private bounds = new THREE.Box3();
  private pressed = new Set<string>();
  private clock = new THREE.Clock();
  private observer: ResizeObserver;
  private selectedBox: THREE.Box3Helper | null = null;
  private issueActors = new Set<string>();
  private selectionIds = new Set<string>();
  private hiddenActors = new Set<string>();
  private issueOverlays = new THREE.Group();
  private issueBounds = new Map<string, THREE.Box3>();
  private flyEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private clickAt = new THREE.Vector2();
  report: FidelityReport | null = null;
  constructor(
    private host: HTMLElement,
    private onSelect: (records: Placement[], additive: boolean) => void,
    private onHint: (text: string) => void,
  ) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.domElement.tabIndex = 0;
    host.prepend(this.renderer.domElement);
    this.scene.background = HORIZON;
    this.scene.fog = new THREE.Fog(HORIZON, 120, 650);
    this.scene.add(
      this.builds,
      this.traps,
      this.markers,
      this.terrain,
      this.scenery,
      this.objectives,
      this.backdrop,
      this.previewGroup,
    );
    this.scene.add(this.issueOverlays);
    this.marquee.className = 'marquee';
    this.marquee.hidden = true;
    host.append(this.marquee);
    this.scene.add(new THREE.HemisphereLight(0xe7f4ff, 0x5c6650, 2));
    const sun = new THREE.DirectionalLight(0xfff3d6, 3);
    sun.position.copy(SUN_DIRECTION).multiplyScalar(80);
    this.scene.add(sun);
    createSky(
      this.renderer,
      this.scene,
      (r) => {
        this.permanent.push(r);
        return r;
      },
      () => {},
    );
    this.camera.position.set(8, 12, 16);
    this.mover = new TrapMover(this.camera, this.scene, this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.mover.onDragging = (dragging) => {
      this.controls.enabled = !dragging && this.mode === 'orbit' && !this.boxSelecting;
    };
    this.controls.enableDamping = true;
    this.controls.maxDistance = 500;
    this.controls.minDistance = 0.12;
    this.controls.zoomToCursor = true;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      this.clickAt.set(e.clientX, e.clientY);
      if (this.boxSelecting && e.button === 0) {
        this.renderer.domElement.setPointerCapture(e.pointerId);
        this.marquee.hidden = false;
        this.updateMarquee(e);
      }
    });
    this.renderer.domElement.addEventListener('pointermove', (e) => {
      if (!this.marquee.hidden) this.updateMarquee(e);
      this.pointer = new THREE.Vector2(e.clientX, e.clientY);
      this.queueHover();
    });
    this.renderer.domElement.addEventListener('pointerleave', () => {
      this.pointer = null;
      if (this.placing) this.onPlacementHover(null);
    });
    this.controls.addEventListener('change', () => this.queueHover());
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (this.marquee.hidden) return;
      this.marquee.hidden = true;
      this.boxPick(e);
    });
    this.renderer.domElement.addEventListener('pointercancel', () => {
      this.marquee.hidden = true;
    });
    this.renderer.domElement.addEventListener('click', (e) => this.pick(e));
    this.renderer.domElement.addEventListener('dblclick', () => {
      if (!this.placing && !this.editTarget && this.mode === 'orbit') this.frame(true);
    });
    document.addEventListener('keydown', this.keydown);
    document.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', this.blur);
    document.addEventListener('mousemove', this.mousemove);
    this.renderer.setAnimationLoop(() => this.animate());
  }
  private resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  private keydown = (e: KeyboardEvent) => {
    if (this.mode !== 'fly' || /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName))
      return;
    if (
      ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ShiftLeft', 'ShiftRight'].includes(
        e.code,
      )
    ) {
      e.preventDefault();
      this.pressed.add(e.code);
    }
  };
  private keyup = (e: KeyboardEvent) => {
    this.pressed.delete(e.code);
  };
  private blur = () => this.pressed.clear();
  private mousemove = (e: MouseEvent) => {
    if (this.mode !== 'fly' || document.pointerLockElement !== this.renderer.domElement) return;
    this.flyEuler.setFromQuaternion(this.camera.quaternion);
    this.flyEuler.y -= e.movementX * 0.002;
    this.flyEuler.x = THREE.MathUtils.clamp(
      this.flyEuler.x - e.movementY * 0.002,
      -Math.PI / 2 + 0.01,
      Math.PI / 2 - 0.01,
    );
    this.camera.quaternion.setFromEuler(this.flyEuler);
  };
  private animate() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.mode === 'orbit' && !this.mover.dragging) this.controls.update();
    this.mover.updateLabels();
    if (this.walker) this.walker.update(dt);
    if (this.mode === 'fly' && document.pointerLockElement === this.renderer.domElement) {
      const speed = (this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight') ? 12 : 3) * dt;
      const motion = new THREE.Vector3(
        Number(this.pressed.has('KeyD')) - Number(this.pressed.has('KeyA')),
        0,
        Number(this.pressed.has('KeyS')) - Number(this.pressed.has('KeyW')),
      );
      if (motion.lengthSq())
        motion.normalize().applyQuaternion(this.camera.quaternion).multiplyScalar(speed);
      motion.y +=
        (Number(this.pressed.has('KeyE') || this.pressed.has('Space')) -
          Number(this.pressed.has('KeyQ'))) *
        speed;
      this.camera.position.add(motion);
    }
    this.renderer.render(this.scene, this.camera);
  }
  setMode(mode: 'orbit' | 'walk' | 'fly', mapSpawn = false) {
    if (mode !== 'orbit') this.mover.detach();
    this.walker?.dispose();
    this.walker = null;
    this.pressed.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    this.mode = mode;
    this.controls.enabled = mode === 'orbit' && !this.boxSelecting;
    if (mode === 'walk') {
      const spawn = mapSpawn
        ? this.spawn.clone()
        : this.controls.target.clone().add(new THREE.Vector3(0, 0.5, 0));
      this.walker = createWalker({
        camera: this.camera,
        controls: this.controls,
        element: this.renderer.domElement,
        scene: this.scene,
        spawn,
        onPointerLock: () => {},
        onReady: () =>
          this.onHint(
            'Click scene to look · WASD move · Shift sprint · Space jump · Esc release mouse',
          ),
      });
      this.onHint('Loading Penny walk mode…');
    } else if (mode === 'fly')
      this.onHint(
        'Click scene to look · WASD fly · E / Q up / down · Shift faster · Esc release mouse',
      );
    else
      this.onHint(
        'Drag orbit · Right-drag pan · Scroll zoom · Arrows move one tile · Page Up/Down move one level · E edit',
      );
  }
  frame(selection = false, preview = false) {
    const bounds = preview
      ? new THREE.Box3().setFromObject(this.previewGroup)
      : selection && this.selectedBox
        ? this.selectedBox.box
        : this.bounds;
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new THREE.Vector3()),
      size = bounds.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, selection || preview ? 1.2 : 4);
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(new THREE.Vector3(0.75, 0.9, 1).multiplyScalar(span));
    this.camera.lookAt(center);
    this.controls.update();
  }
  private clearSelection() {
    if (this.selectedBox) {
      this.scene.remove(this.selectedBox);
      this.selectedBox.geometry.dispose();
      (this.selectedBox.material as THREE.Material).dispose();
      this.selectedBox = null;
    }
  }
  setBoxSelection(enabled: boolean) {
    if (enabled) this.mover.detach();
    this.boxSelecting = enabled;
    this.controls.enabled = this.mode === 'orbit' && !enabled;
    this.marquee.hidden = true;
  }
  setPlacementMode(enabled: boolean) {
    this.placing = enabled;
    if (enabled) {
      this.mover.detach();
      this.setBoxSelection(false);
    }
    this.renderer.domElement.style.cursor = enabled ? 'crosshair' : '';
    if (!enabled) this.pointer = null;
  }
  setEditTarget(actorPath: string | null) {
    for (const { mesh, index, matrix } of this.editMatrices) {
      mesh.setMatrixAt(index, matrix);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    }
    this.editMatrices = [];
    this.editTarget = actorPath;
    if (!actorPath) return;
    this.builds.traverse((o) => {
      if (!(o instanceof THREE.InstancedMesh)) return;
      (o.userData.records as Placement[]).forEach((p, i) => {
        if (p.actorPath !== actorPath) return;
        const matrix = new THREE.Matrix4();
        o.getMatrixAt(i, matrix);
        this.editMatrices.push({ mesh: o, index: i, matrix });
        o.setMatrixAt(
          i,
          new THREE.Matrix4()
            .makeScale(0, 0, 0)
            .setPosition(new THREE.Vector3().setFromMatrixPosition(matrix)),
        );
      });
      o.instanceMatrix.needsUpdate = true;
      o.computeBoundingBox();
      o.computeBoundingSphere();
    });
  }
  viewFrom(view: string) {
    const directions: Record<string, THREE.Vector3> = {
      top: new THREE.Vector3(0, 1, 0.0001),
      bottom: new THREE.Vector3(0, -1, 0.0001),
      front: new THREE.Vector3(1, 0, 0),
      back: new THREE.Vector3(-1, 0, 0),
      left: new THREE.Vector3(0, 0, 1),
      right: new THREE.Vector3(0, 0, -1),
      perspective: new THREE.Vector3(0.75, 0.9, 1),
    };
    const direction = directions[view];
    if (!direction) return;
    const distance = Math.max(1.5, this.camera.position.distanceTo(this.controls.target));
    this.camera.position
      .copy(this.controls.target)
      .add(direction.normalize().multiplyScalar(distance));
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.queueHover();
  }
  facePiece(p: Placement) {
    const kind = structureKind(p),
      center = new THREE.Vector3(...p.transform.translation).add(
        new THREE.Vector3(0, kind === 'wall' ? 0 : 256, kind === 'wall' ? 192 : 0).applyQuaternion(
          new THREE.Quaternion(...p.transform.rotation),
        ),
      );
    const offset = new THREE.Vector3(
      ...((kind === 'wall' ? [0, 1100, 60] : [0, 200, 1100]) as [number, number, number]),
    ).applyQuaternion(new THREE.Quaternion(...p.transform.rotation));
    this.controls.target.copy(scenePoint(center.toArray()));
    this.camera.position.copy(scenePoint(center.add(offset).toArray()));
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }
  startTrapMove() {
    if (!this.selectedBox) throw new Error('Select a visible trap first.');
    this.setBoxSelection(false);
    this.mover.attach(this.selectedBox.box.getCenter(new THREE.Vector3()));
  }
  previewTrapMove(ids: ReadonlySet<string>, delta: Vec3) {
    for (const group of [this.traps, this.markers])
      group.traverse((o) => {
        if (!(o instanceof THREE.InstancedMesh)) return;
        (o.userData.records as Placement[]).forEach((p, i) => {
          if (!ids.has(p.actorPath)) return;
          const translation = p.meshTransform.translation.map((v, j) => v + delta[j]) as Vec3;
          o.setMatrixAt(
            i,
            group === this.markers
              ? new THREE.Matrix4().makeTranslation(...scenePoint(translation).toArray())
              : sceneMatrix({
                  ...p.meshTransform,
                  translation,
                  scale: p.meshTransform.scale.map(Math.abs) as Vec3,
                }),
          );
        });
        o.instanceMatrix.needsUpdate = true;
        o.computeBoundingBox();
        o.computeBoundingSphere();
      });
    this.setSelection(ids);
  }
  refreshPlacement() {
    this.queueHover();
  }
  isFilteredOut(actorPath: string) {
    return this.hiddenActors.has(actorPath);
  }
  setHiddenActors(ids: ReadonlySet<string>) {
    this.hiddenActors = new Set(ids);
    const matrix = new THREE.Matrix4();
    for (const group of [this.traps, this.markers])
      group.traverse((o) => {
        if (!(o instanceof THREE.InstancedMesh)) return;
        const originals = (o.userData.unfilteredMatrices ??= o.instanceMatrix.array.slice());
        let visible = 0;
        (o.userData.records as Placement[]).forEach((p, i) => {
          matrix.fromArray(originals, i * 16);
          if (ids.has(p.actorPath)) {
            const position = new THREE.Vector3().setFromMatrixPosition(matrix);
            matrix.makeScale(0, 0, 0).setPosition(position);
          } else visible++;
          o.setMatrixAt(i, matrix);
        });
        o.visible = visible > 0;
        o.instanceMatrix.needsUpdate = true;
        o.computeBoundingBox();
        o.computeBoundingSphere();
      });
    this.setSelection(this.selectionIds);
  }
  private queueHover() {
    if (!this.placing || !this.pointer || this.hoverQueued) return;
    this.hoverQueued = true;
    requestAnimationFrame(() => {
      this.hoverQueued = false;
      if (this.placing && this.pointer)
        this.onPlacementHover(this.placementHit(this.pointer.x, this.pointer.y));
    });
  }
  private placementHit(x: number, y: number): PlacementHit | null {
    if (!this.builds.visible || this.mode !== 'orbit') return null;
    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    const rect = this.renderer.domElement.getBoundingClientRect(),
      ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((x - rect.left) / rect.width) * 2 - 1,
        (-(y - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const unreal = (v: THREE.Vector3): Vec3 => [-v.z * 512, v.x * 512, v.y * 512];
    const terrainHit = this.terrain.visible
      ? ray.intersectObject(this.terrain, true)[0]
      : undefined;
    let ground: PlacementHit | null = null;
    let groundDistance = Infinity;
    if (terrainHit) {
      groundDistance = terrainHit.distance;
      const matrix = terrainHit.object.matrixWorld.clone();
      if (terrainHit.object instanceof THREE.InstancedMesh && terrainHit.instanceId !== undefined) {
        const instance = new THREE.Matrix4();
        terrainHit.object.getMatrixAt(terrainHit.instanceId, instance);
        matrix.multiply(instance);
      }
      const normal = terrainHit.face?.normal
        .clone()
        .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(matrix));
      if (terrainHit.object.userData[WALKABLE] && normal && normal.y > 0.5)
        ground = {
          record: null,
          point: unreal(terrainHit.point),
          camera: unreal(this.camera.position),
        };
    } else if (!this.environmentZone && ray.ray.direction.y < -1e-7) {
      const point = ray.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
        new THREE.Vector3(),
      );
      if (point) {
        groundDistance = ray.ray.origin.distanceTo(point);
        ground = { record: null, point: unreal(point), camera: unreal(this.camera.position) };
      }
    }
    const hits = ray.intersectObject(this.builds, true);
    for (const hit of hits) {
      const record = (hit.object.userData.records as Placement[] | undefined)?.[
        hit.instanceId ?? 0
      ];
      if (!record || record.captureRole !== 'placement' || this.hiddenActors.has(record.actorPath))
        continue;
      if (hit.distance > groundDistance + 0.02) break;
      return { record, point: unreal(hit.point), camera: unreal(this.camera.position) };
    }
    const origin = new THREE.Vector3(
      -ray.ray.origin.z * 512,
      ray.ray.origin.x * 512,
      ray.ray.origin.y * 512,
    );
    const direction = new THREE.Vector3(
      -ray.ray.direction.z,
      ray.ray.direction.x,
      ray.ray.direction.y,
    );
    let nearest: {
      record: Placement;
      point: Vec3;
      distance: number;
    } | null = null;
    for (const record of this.placementRecords) {
      const kind = structureKind(record);
      if (!kind || this.hiddenActors.has(record.actorPath)) continue;
      const inverse = new THREE.Quaternion(...record.transform.rotation).invert();
      const local = origin
          .clone()
          .sub(new THREE.Vector3(...record.transform.translation))
          .applyQuaternion(inverse),
        d = direction.clone().applyQuaternion(inverse);
      const denominator = kind === 'wall' ? d.y : d.z;
      if (Math.abs(denominator) < 1e-7) continue;
      const distance = -(kind === 'wall' ? local.y : local.z) / denominator;
      if (
        distance <= 0 ||
        distance > (groundDistance + 0.02) * 512 ||
        (nearest && distance >= nearest.distance)
      )
        continue;
      const at = local.clone().addScaledVector(d, distance);
      if (
        Math.abs(at.x) > 352 ||
        (kind === 'wall' ? at.z < -80 || at.z > 464 : at.y < -96 || at.y > 608)
      )
        continue;
      nearest = {
        record,
        point: origin.clone().addScaledVector(direction, distance).toArray() as Vec3,
        distance,
      };
    }
    return nearest
      ? { record: nearest.record, point: nearest.point, camera: origin.toArray() as Vec3 }
      : ground;
  }
  private updateMarquee(e: PointerEvent) {
    const r = this.host.getBoundingClientRect();
    Object.assign(this.marquee.style, {
      left: `${Math.min(e.clientX, this.clickAt.x) - r.left}px`,
      top: `${Math.min(e.clientY, this.clickAt.y) - r.top}px`,
      width: `${Math.abs(e.clientX - this.clickAt.x)}px`,
      height: `${Math.abs(e.clientY - this.clickAt.y)}px`,
    });
  }
  private boxPick(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect(),
      found = new Map<string, Placement>();
    const minX = Math.min(e.clientX, this.clickAt.x),
      maxX = Math.max(e.clientX, this.clickAt.x),
      minY = Math.min(e.clientY, this.clickAt.y),
      maxY = Math.max(e.clientY, this.clickAt.y);
    this.scene.updateMatrixWorld(true);
    for (const group of [this.builds, this.traps, this.markers])
      if (group.visible)
        group.traverse((o) => {
          if (!(o instanceof THREE.InstancedMesh)) return;
          o.geometry.computeBoundingBox();
          const center = o.geometry.boundingBox!.getCenter(new THREE.Vector3()),
            matrix = new THREE.Matrix4();
          (o.userData.records as Placement[]).forEach((p, i) => {
            if (p.captureRole !== 'placement' || this.hiddenActors.has(p.actorPath)) return;
            o.getMatrixAt(i, matrix);
            const point = center
              .clone()
              .applyMatrix4(matrix)
              .applyMatrix4(o.matrixWorld)
              .project(this.camera);
            const x = rect.left + ((point.x + 1) * rect.width) / 2,
              y = rect.top + ((1 - point.y) * rect.height) / 2;
            if (point.z >= -1 && point.z <= 1 && x >= minX && x <= maxX && y >= minY && y <= maxY)
              found.set(p.actorPath, p);
          });
        });
    this.onSelect([...found.values()], e.shiftKey);
  }
  setSelection(ids: ReadonlySet<string>) {
    this.selectionIds = new Set(ids);
    this.clearSelection();
    const supports = new Set<string>();
    for (const group of [this.traps, this.markers])
      group.traverse((o) => {
        if (!(o instanceof THREE.InstancedMesh)) return;
        for (const p of o.userData.records as Placement[]) {
          if (p.kind !== 'trap' || !ids.has(p.actorPath) || this.hiddenActors.has(p.actorPath))
            continue;
          const link = attachment(p);
          if (link?.status === 'resolved' && link.supportActorPath)
            supports.add(link.supportActorPath);
        }
      });
    const bounds = new THREE.Box3(),
      matrix = new THREE.Matrix4();
    this.issueBounds.clear();
    for (const group of [this.builds, this.traps, this.markers])
      group.traverse((o) => {
        if (!(o instanceof THREE.InstancedMesh)) return;
        o.geometry.computeBoundingBox();
        (o.userData.records as Placement[]).forEach((p, i) => {
          if (this.hiddenActors.has(p.actorPath)) {
            o.setColorAt(i, new THREE.Color(0xffffff));
            return;
          }
          const selected = ids.has(p.actorPath),
            invalid = this.issueActors.has(p.actorPath),
            support = p.kind === 'structure' && supports.has(p.actorPath);
          o.setColorAt(
            i,
            new THREE.Color(
              invalid ? 0xff3535 : selected ? 0x83baff : support ? 0xffcd80 : 0xffffff,
            ),
          );
          if (invalid) {
            o.getMatrixAt(i, matrix);
            const box = o.geometry
              .boundingBox!.clone()
              .applyMatrix4(matrix)
              .applyMatrix4(o.matrixWorld);
            if ([...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)) {
              const prior = this.issueBounds.get(p.actorPath);
              if (prior) prior.union(box);
              else this.issueBounds.set(p.actorPath, box);
            }
          }
          if (selected) {
            o.getMatrixAt(i, matrix);
            bounds.union(
              o.geometry.boundingBox!.clone().applyMatrix4(matrix).applyMatrix4(o.matrixWorld),
            );
          }
        });
        if (o.instanceColor) o.instanceColor.needsUpdate = true;
      });
    if (!bounds.isEmpty()) {
      this.selectedBox = new THREE.Box3Helper(bounds, 0x81b6ff);
      this.scene.add(this.selectedBox);
    }
    this.updateIssueOverlays();
  }
  setExportIssues(ids: ReadonlySet<string>) {
    this.issueActors = new Set(ids);
    this.setSelection(this.selectionIds);
  }
  private updateIssueOverlays() {
    const existing = new Map(
      this.issueOverlays.children.map((o) => [
        o.userData.actorPath as string,
        o as THREE.Box3Helper,
      ]),
    );
    for (const [id, box] of this.issueBounds) {
      const found = existing.get(id);
      if (found) {
        found.box.copy(box);
        existing.delete(id);
        continue;
      }
      const helper = new THREE.Box3Helper(box.clone(), 0xff3535);
      helper.userData.actorPath = id;
      helper.renderOrder = 12;
      const material = helper.material as THREE.LineBasicMaterial;
      material.depthTest = false;
      material.depthWrite = false;
      material.transparent = true;
      material.opacity = 0.9;
      this.issueOverlays.add(helper);
    }
    for (const helper of existing.values()) {
      helper.removeFromParent();
      helper.geometry.dispose();
      (helper.material as THREE.Material).dispose();
    }
  }
  async preview(records: Placement[], valid = true) {
    const generation = ++this.previewGeneration;
    this.previewGroup.clear();
    for (const r of this.previewResources) r.dispose();
    this.previewResources = [];
    if (!records.length) return;
    const [builds, traps] = await Promise.all([loadPrimaryBuildMeshes(), loadPrimaryTrapMeshes()]);
    if (generation !== this.previewGeneration) return;
    const material = new THREE.MeshBasicMaterial({
      color: valid ? 0x6caeff : 0xff7060,
      wireframe: records.length > 1,
      transparent: true,
      opacity: records.length > 1 ? 0.65 : 0.5,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.previewResources.push(material);
    for (const p of records) {
      const identity = meshIdentity(p.meshPath),
        parts = identity
          ? (identity.library === 'build' ? builds : traps).get(identity.key)
          : undefined;
      if (parts?.length)
        for (const part of parts) {
          const mesh = new THREE.Mesh(part.geometry, material);
          mesh.matrixAutoUpdate = false;
          mesh.matrix.copy(sceneMatrix(p.meshTransform));
          mesh.renderOrder = 10;
          this.previewGroup.add(mesh);
        }
      else {
        const geometry = new THREE.OctahedronGeometry(0.12);
        this.previewResources.push(geometry);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(scenePoint(p.meshTransform.translation));
        this.previewGroup.add(mesh);
      }
    }
  }
  private pick(e: MouseEvent) {
    if (this.editTarget) return;
    if (this.mode === 'fly') {
      void this.renderer.domElement.requestPointerLock().catch(() => {});
      return;
    }
    if (
      this.boxSelecting ||
      this.mode !== 'orbit' ||
      this.clickAt.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 4
    )
      return;
    if (this.placing) {
      this.onPlacementClick(this.placementHit(e.clientX, e.clientY));
      return;
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const hits = ray.intersectObjects([this.builds, this.traps, this.markers], true).filter((h) => {
      const record = (h.object.userData.records as Placement[] | undefined)?.[h.instanceId ?? 0];
      if (record && this.hiddenActors.has(record.actorPath)) return false;
      for (let n: THREE.Object3D | null = h.object; n; n = n.parent) if (!n.visible) return false;
      return true;
    });
    const hit = hits[0];
    if (!hit) {
      this.onSelect([], e.shiftKey);
      return;
    }
    const records = hit.object.userData.records as Placement[] | undefined;
    const record = records?.[hit.instanceId ?? 0];
    if (!record) return;
    this.onSelect([record], e.shiftKey);
  }
  async load(data: Capture, file: string, preserveView = false) {
    this.setEditTarget(null);
    this.placementRecords = data.placements.filter(
      (p) => p.kind === 'structure' && p.captureRole === 'placement',
    );
    this.mover.detach();
    this.issueActors.clear();
    this.selectionIds.clear();
    this.hiddenActors.clear();
    this.issueBounds.clear();
    this.updateIssueOverlays();
    const generation = ++this.generation;
    this.setMode('orbit');
    this.clearSelection();
    void this.preview([]);
    for (const r of this.resources) r.dispose();
    this.resources = [];
    for (const g of [this.builds, this.traps, this.markers]) {
      g.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
      });
      g.clear();
    }
    this.bounds.makeEmpty();
    const track = <
      T extends {
        dispose(): void;
      },
    >(
      r: T,
    ): T => {
      this.resources.push(r);
      return r;
    };
    const [buildLibrary, trapLibrary] = await Promise.all([
      loadPrimaryBuildMeshes(),
      loadPrimaryTrapMeshes(),
    ]);
    if (generation !== this.generation) return null;
    const zone = zoneForCapture(data);
    const report: FidelityReport = {
      file,
      records: data.placements.length,
      rendered: 0,
      unmatched: [],
      unavailable: 0,
      existingWorld: 0,
      zone,
      completeHomebase: data.completeHomebase === true,
      transformPolicy:
        'Authoritative meshTransform. Binary64 input retained; basis (Y,Z,-X)/512. No snapping, Euler reduction, or duplicate mirroring. Known Penny edge-origin trap meshes have the exporter centering reversed by +256 local Unreal Y BEFORE the saved rotation and scale; saved transforms are never changed.',
      trapPivotCorrections: { records: 0, localUnrealOffset: [0, 256, 0], meshes: [] },
      limitations: [
        'The known horizontal half-tile trap-centering offset is corrected. Penny GLBs also bake blueprint component transforms and vertical ceiling seating together with quantization. Those remaining asset details are unverified; a source-name match is not proof of complete 1:1 fidelity.',
        'Penny build meshes use recovered LOD1 geometry and quantized GLB assets; GPU rendering uses float32.',
        'Healing Pad and Flame Grill use recovered native meshes and pivots. Anti-Air uses recovered base, body, head and ammo display with blueprint default component poses; live turret aim and charge state are not recorded. Original textures use approximate static PBR materials.',
        'Only recorded primary mesh transforms are authoritative. Unrecorded trap moving parts, effects, doors and other components cannot be reconstructed exactly.',
        'Terrain and optional scenery are Penny static map assets, not a captured current map state.',
        'A loaded-actor capture does not prove that every homebase actor was saved.',
        'Penny walk mode uses approximate raycast collisions, not Unreal character physics.',
      ],
    };
    const batches = new Map<
      string,
      {
        parts: BuildPart[];
        records: Placement[];
        signs: number[];
      }
    >();
    const missing: Placement[] = [];
    for (const p of data.placements) {
      if (p.captureRole === 'unavailable') {
        report.unavailable++;
        continue;
      }
      if (p.captureRole === 'existing-world') report.existingWorld++;
      this.bounds.expandByPoint(scenePoint(p.meshTransform.translation));
      const identity = meshIdentity(p.meshPath);
      const parts = identity
        ? (identity.library === 'build' ? buildLibrary : trapLibrary).get(identity.key)
        : undefined;
      if (!parts?.length) {
        report.unmatched.push({
          actorPath: p.actorPath,
          meshPath: p.meshPath,
          reason: 'No exact source mesh in the bundled libraries',
        });
        missing.push(p);
        continue;
      }
      if (identity!.library === 'trap' && pennyTrapPivotOffset(identity!.key)[0] !== 0) {
        report.trapPivotCorrections.records++;
        if (!report.trapPivotCorrections.meshes.includes(identity!.key))
          report.trapPivotCorrections.meshes.push(identity!.key);
      }
      const signs = [
        p.meshTransform.scale[1],
        p.meshTransform.scale[2],
        p.meshTransform.scale[0],
      ].map((n) => (n < 0 ? -1 : 1));
      const key = `${p.kind}:${identity!.library}:${identity!.key}:${signs}`;
      const batch = batches.get(key) ?? { parts, records: [], signs };
      batch.records.push(p);
      batches.set(key, batch);
      report.rendered++;
    }
    for (const { parts, records, signs } of batches.values())
      for (const part of parts) {
        let geometry = part.geometry;
        if (signs.some((s) => s < 0)) {
          geometry = track(geometry.clone());
          geometry.scale(signs[0], signs[1], signs[2]);
          if (signs[0] * signs[1] * signs[2] < 0) {
            if (!geometry.index)
              geometry.setIndex(
                Array.from({ length: geometry.getAttribute('position').count }, (_, i) => i),
              );
            const idx = geometry.index!;
            for (let i = 0; i < idx.count; i += 3) {
              const a = idx.getX(i);
              idx.setX(i, idx.getX(i + 2));
              idx.setX(i + 2, a);
            }
            idx.needsUpdate = true;
          }
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();
        }
        const material = track(part.material.clone());
        material.side = THREE.DoubleSide;
        const mesh = new THREE.InstancedMesh(geometry, material, records.length);
        records.forEach((p, i) => {
          const transform = {
            ...p.meshTransform,
            scale: p.meshTransform.scale.map(Math.abs) as [number, number, number],
          };
          mesh.setMatrixAt(i, sceneMatrix(transform));
        });
        mesh.userData.records = records;
        mesh.userData[WALKABLE] = records[0].kind === 'structure';
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();
        (records[0].kind === 'structure' ? this.builds : this.traps).add(mesh);
      }
    if (missing.length) {
      const geometry = track(new THREE.OctahedronGeometry(0.09));
      const material = track(new THREE.MeshBasicMaterial({ color: 0xff70b6, wireframe: true }));
      const mesh = new THREE.InstancedMesh(geometry, material, missing.length);
      missing.forEach((p, i) =>
        mesh.setMatrixAt(
          i,
          new THREE.Matrix4().makeTranslation(...scenePoint(p.meshTransform.translation).toArray()),
        ),
      );
      mesh.userData.records = missing;
      mesh.computeBoundingSphere();
      this.markers.add(mesh);
    }
    this.report = report;
    if (!preserveView) this.frame();
    const terrainInfo = zone ? OUTPOST_ZONE_TERRAIN[zone] : undefined;
    this.spawn = terrainInfo?.spawn
      ? new THREE.Vector3(terrainInfo.spawn[1], terrainInfo.spawn[2] + 0.5, -terrainInfo.spawn[0])
      : this.controls.target.clone().add(new THREE.Vector3(0, 1, 0));
    if (zone !== this.environmentZone) {
      for (const r of this.environmentResources) r.dispose();
      this.environmentResources = [];
      for (const group of [this.terrain, this.scenery, this.backdrop, this.objectives]) {
        group.traverse((o) => {
          if (o instanceof THREE.InstancedMesh) o.dispose();
        });
        group.clear();
      }
      this.environmentZone = zone;
      if (zone) {
        const track = <
          T extends {
            dispose(): void;
          },
        >(
          r: T,
        ): T => {
          this.environmentResources.push(r);
          return r;
        };
        const water = track(
          new THREE.MeshStandardMaterial({
            color: 0x568792,
            roughness: 0.35,
            transparent: true,
            opacity: 0.85,
          }),
        );
        const recovered = createZoneTerrain({ zoneId: zone, track, water, onLoad: () => {} });
        this.terrain.add(recovered.group);
        try {
          await recovered.ready;
          recovered.group.traverse((o) => {
            if (o instanceof THREE.Mesh) o.userData[WALKABLE] = !/lava|water/i.test(o.name);
          });
        } catch (error) {
          report.limitations.push(`Terrain could not load: ${String(error)}`);
        }
        if (generation !== this.generation) return null;
        await Promise.all([
          addZoneBackdrops(zone, this.backdrop, () => generation !== this.generation),
          addZoneScenery(zone, this.scenery, () => generation !== this.generation),
          addZoneObjectives(zone, this.objectives, () => generation !== this.generation).catch(
            (error) =>
              report.limitations.push(`Outpost objectives could not load: ${String(error)}`),
          ),
        ]);
      } else report.limitations.push('Unrecognized zone: no terrain has been added.');
    }
    this.scene.updateMatrixWorld(true);
    return report;
  }
  dispose() {
    this.issueBounds.clear();
    this.updateIssueOverlays();
    this.mover.dispose();
    this.generation++;
    this.walker?.dispose();
    this.renderer.setAnimationLoop(null);
    this.controls.dispose();
    this.observer.disconnect();
    for (const r of [...this.resources, ...this.permanent]) r.dispose();
    this.renderer.dispose();
    document.removeEventListener('keydown', this.keydown);
    document.removeEventListener('keyup', this.keyup);
    window.removeEventListener('blur', this.blur);
    document.removeEventListener('mousemove', this.mousemove);
  }
}
