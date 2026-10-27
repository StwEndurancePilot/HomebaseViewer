import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Pose } from './save';
export function scenePoint([x, y, z]: readonly number[]): Vector3 {
  return new Vector3(y / 512, z / 512, -x / 512);
}
export function sceneMatrix(pose: Pose): Matrix4 {
  const [x, y, z, w] = pose.rotation;
  return new Matrix4().compose(
    scenePoint(pose.translation),
    new Quaternion(-y, -z, x, w),
    new Vector3(pose.scale[1], pose.scale[2], pose.scale[0]),
  );
}
