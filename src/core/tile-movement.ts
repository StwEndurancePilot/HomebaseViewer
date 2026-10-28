import type { Placement } from './save';
import { attachment, placementConflict, relativePose, type Vec3 } from './editor';

export function tileKeyDelta(key: string, sceneRight: Vec3): Vec3 | null {
  if (key === 'PageUp') return [0, 0, 384];
  if (key === 'PageDown') return [0, 0, -384];
  const right: Vec3 =
    Math.abs(sceneRight[2]) > Math.abs(sceneRight[0])
      ? [-Math.sign(sceneRight[2]) * 512, 0, 0]
      : [0, Math.sign(sceneRight[0]) * 512, 0];
  const up: Vec3 = [right[1], -right[0], 0];
  const direction = { ArrowUp: up, ArrowDown: up, ArrowLeft: right, ArrowRight: right }[key];
  if (!direction) return null;
  const sign = key === 'ArrowDown' || key === 'ArrowLeft' ? -1 : 1;
  return direction.map((v) => (v === 0 ? 0 : v * sign)) as Vec3;
}

export function moveTiles(
  rows: Placement[],
  selected: ReadonlySet<string>,
  delta: Vec3,
): Placement[] {
  if (!selected.size) throw new Error('Select pieces to move.');
  if (!delta.every(Number.isFinite)) throw new Error('Movement must use finite coordinates.');
  const ids = new Set(selected);
  for (const p of rows)
    if (p.kind === 'trap' && ids.has(attachment(p)?.supportActorPath ?? '')) ids.add(p.actorPath);
  const byId = new Map(rows.map((p) => [p.actorPath, p]));
  for (const id of ids)
    if (byId.get(id)?.captureRole !== 'placement')
      throw new Error('Only player-built pieces can be moved.');
  const changes = new Map<string, Placement>();
  for (const p of rows) {
    if (!ids.has(p.actorPath)) continue;
    const moved = structuredClone(p);
    for (const pose of [moved.transform, moved.meshTransform])
      pose.translation = pose.translation.map((v, i) => v + delta[i]) as Vec3;
    changes.set(p.actorPath, moved);
  }
  for (const p of changes.values()) {
    if (p.kind !== 'trap') continue;
    const link = attachment(p);
    const parent =
      changes.get(link?.supportActorPath ?? '') ?? byId.get(link?.supportActorPath ?? '');
    if (!parent || parent.kind !== 'structure' || parent.captureRole !== 'placement')
      throw new Error('Selected traps need captured building supports.');
    p.attachment = {
      ...link,
      status: 'resolved',
      supportTransform: structuredClone(parent.transform),
      relativeTransform: relativePose(p.transform, parent.transform),
    };
    if (!changes.has(parent.actorPath)) p.editorPlacementMode = 'menu-offset';
  }
  const checked = rows.filter((p) => !changes.has(p.actorPath));
  for (const p of changes.values()) {
    const issue = placementConflict(p, checked);
    if (issue) throw new Error(issue);
    checked.push(p);
  }
  return rows.map((p) => changes.get(p.actorPath) ?? p);
}
