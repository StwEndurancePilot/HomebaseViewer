import {
  Euler,
  Object3D,
  Quaternion,
  Vector3,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
} from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { scenePoint } from '../core/transforms';
import type { Vec3 } from '../core/editor';
export type TrapMoverMode = 'translate' | 'rotate';
export function sceneRotationToAngles(delta: Quaternion, step: number, max: number): Vec3 {
  const euler = new Euler().setFromQuaternion(
    new Quaternion(delta.z, -delta.x, -delta.y, delta.w),
    'ZYX',
  );
  const deg = 180 / Math.PI;
  const angle = (value: number) => {
    const snapped = step ? Math.round(value / step) * step : value;
    return Math.max(-max, Math.min(max, snapped));
  };
  return [angle(-euler.y * deg), angle(euler.z * deg), angle(-euler.x * deg)];
}
export function dragOffset(
  start: Vector3,
  end: Vector3,
  step: number,
  max: number,
  zRange: readonly [number, number] = [-Infinity, Infinity],
): Vec3 {
  const delta = end.clone().sub(start),
    cm = [-delta.z * 512, delta.x * 512, delta.y * 512];
  const result = cm.map((v) =>
    Math.max(-max, Math.min(max, step ? Math.round(v / step) * step : v)),
  ) as Vec3;
  result[2] = Math.max(zRange[0], Math.min(zRange[1], result[2]));
  return result;
}
export class TrapMover {
  readonly control: TransformControls;
  readonly pivot = new Object3D();
  onPreview: (delta: Vec3) => void = () => {};
  onCommit: (delta: Vec3) => void = () => {};
  onRotatePreview: (angles: Vec3) => void = () => {};
  onRotateCommit: (angles: Vec3) => void = () => {};
  onDragging: (dragging: boolean) => void = () => {};
  step = 0;
  max = 2000;
  angleStep = 5;
  angleMax = 3600;
  zRange: readonly [number, number] = [-Infinity, Infinity];
  mode: TrapMoverMode = 'translate';
  private start = new Vector3();
  private startQuaternion = new Quaternion();
  private delta: Vec3 = [0, 0, 0];
  private angles: Vec3 = [0, 0, 0];
  private transaction = false;
  private suppressClick = false;
  private labels = ['X', 'Y', 'Z'].map((axis) => {
    const label = document.createElement('span');
    label.className = `gizmo-label axis-${axis.toLowerCase()}`;
    label.textContent = `+${axis}`;
    label.hidden = true;
    return label;
  });
  constructor(
    private camera: PerspectiveCamera,
    scene: Scene,
    private canvas: HTMLCanvasElement,
  ) {
    this.control = new TransformControls(camera, canvas);
    this.control.enabled = false;
    this.control.setMode('translate');
    this.control.setSpace('world');
    this.control.setSize(1.1);
    this.tint();
    scene.add(this.pivot, this.control);
    canvas.parentElement!.append(...this.labels);
    this.control.addEventListener('mouseDown', () => {
      this.start.copy(this.pivot.position);
      this.startQuaternion.copy(this.pivot.quaternion);
      this.delta = [0, 0, 0];
      this.angles = [0, 0, 0];
      this.transaction = true;
      this.suppressClick = true;
      this.onDragging(true);
    });
    this.control.addEventListener('objectChange', () => {
      if (!this.transaction) return;
      if (this.mode === 'rotate') {
        const delta = this.startQuaternion.clone().invert().multiply(this.pivot.quaternion);
        this.angles = sceneRotationToAngles(delta, this.angleStep, this.angleMax);
        this.onRotatePreview(this.angles);
        return;
      }
      this.delta = dragOffset(this.start, this.pivot.position, this.step, this.max, this.zRange);
      this.pivot.position.copy(this.start).add(scenePoint(this.delta));
      this.onPreview(this.delta);
    });
    this.control.addEventListener('mouseUp', () => {
      if (!this.transaction) return;
      this.transaction = false;
      this.onDragging(false);
      if (this.mode === 'rotate') {
        if (this.angles.some((v) => v !== 0)) this.onRotateCommit(this.angles);
      } else if (this.delta.some((v) => v !== 0)) this.onCommit(this.delta);
    });
    canvas.addEventListener('pointerdown', this.pointerDown, true);
    canvas.addEventListener('click', this.click, true);
    canvas.addEventListener('pointercancel', this.cancel);
    window.addEventListener('blur', this.cancel);
  }
  private pointerDown = () => {
    this.suppressClick = false;
  };
  private click = (e: MouseEvent) => {
    if (this.suppressClick) {
      e.stopImmediatePropagation();
      this.suppressClick = false;
    }
  };
  cancel = () => {
    if (!this.transaction) return;
    this.transaction = false;
    this.control.dragging = false;
    this.pivot.position.copy(this.start);
    this.pivot.quaternion.copy(this.startQuaternion);
    this.delta = [0, 0, 0];
    this.angles = [0, 0, 0];
    if (this.mode === 'rotate') this.onRotatePreview(this.angles);
    else this.onPreview(this.delta);
    this.onDragging(false);
  };
  setMode(mode: TrapMoverMode) {
    if (this.mode === mode) return;
    this.cancel();
    this.mode = mode;
    this.control.setMode(mode);
    this.control.setSpace('world');
    this.control.setSize(mode === 'rotate' ? 0.9 : 1.1);
    this.tint();
    if (mode !== 'translate') for (const label of this.labels) label.hidden = true;
  }
  attach(position: Vector3) {
    this.detach();
    this.pivot.position.copy(position);
    this.pivot.quaternion.identity();
    this.pivot.updateMatrixWorld();
    this.control.attach(this.pivot);
    this.control.enabled = true;
  }
  detach() {
    this.cancel();
    this.control.detach();
    this.control.enabled = false;
    for (const label of this.labels) label.hidden = true;
  }
  get active() {
    return Boolean(this.control.object);
  }
  get dragging() {
    return this.transaction;
  }
  updateLabels() {
    if (!this.active || this.mode !== 'translate') return;
    const factor =
      (this.pivot.position.distanceTo(this.camera.position) *
        Math.min((1.9 * Math.tan((Math.PI * this.camera.fov) / 360)) / this.camera.zoom, 7) *
        this.control.size) /
      4;
    const directions = [new Vector3(0, 0, -1), new Vector3(1, 0, 0), new Vector3(0, 1, 0)];
    this.labels.forEach((label, i) => {
      const point = this.pivot.position
        .clone()
        .addScaledVector(directions[i], factor * 0.73)
        .project(this.camera);
      label.hidden = point.z < -1 || point.z > 1;
      label.style.left = `${((point.x + 1) * this.canvas.clientWidth) / 2}px`;
      label.style.top = `${((1 - point.y) * this.canvas.clientHeight) / 2}px`;
    });
  }
  private tint() {
    const colors: Record<string, number> = {
      X: 0x64ce89,
      Y: 0x78adff,
      Z: 0xff7878,
      XY: 0x78dadd,
      YZ: 0xd7a0ef,
      XZ: 0xe3cf7a,
    };
    this.control.traverse((o) => {
      if (
        o instanceof Mesh &&
        o.material instanceof MeshBasicMaterial &&
        colors[o.name] !== undefined
      )
        o.material.color.setHex(colors[o.name]);
    });
  }
  dispose() {
    this.detach();
    this.control.dispose();
    this.control.removeFromParent();
    this.pivot.removeFromParent();
    this.labels.forEach((l) => l.remove());
    this.canvas.removeEventListener('pointerdown', this.pointerDown, true);
    this.canvas.removeEventListener('click', this.click, true);
    this.canvas.removeEventListener('pointercancel', this.cancel);
    window.removeEventListener('blur', this.cancel);
  }
}
