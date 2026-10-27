import { it, expect } from 'vitest';
import { buildingRecord, exportDiagnostics, exportIssues } from '../src/core/editor';
import { exportCapture } from '../src/core/export';
import type { Capture, Placement } from '../src/core/save';
const floor = () =>
  buildingRecord('floor', 2, 3, {
    translation: [1.25, 2.5, 3.75],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  });
const capture = (placements: Placement[]) =>
  ({
    schemaVersion: 6,
    format: 'stw-homebase-capture',
    worldPath: 'test',
    placements,
    completeHomebase: false,
  }) as Capture;
it('associates every error with exact actor identities without changing the capture', () => {
  const floors = Array.from({ length: 5 }, () => ({ ...floor(), classPath: '' })),
    data = capture(floors),
    before = structuredClone(data);
  const issues = exportDiagnostics(data);
  expect(issues).toHaveLength(5);
  expect(issues.map((i) => i.actorPaths)).toEqual(floors.map((p) => [p.actorPath]));
  expect(data).toEqual(before);
  expect(exportIssues(data)).toHaveLength(5);
  try {
    exportCapture(data);
    throw new Error('Expected blocked export');
  } catch (e) {
    for (const p of floors) expect(String(e)).toContain(p.actorPath);
  }
});
it('keeps multiple reasons on a trap and does not attribute a missing support to unrelated structures', () => {
  const f = floor(),
    p: Placement = {
      ...floor(),
      kind: 'trap',
      classPath: '/Trap_Floor_Launcher',
      itemPath: '',
      attachmentType: 300,
      attachment: { status: 'unresolved', supportActorPath: 'missing', side: 0 },
    };
  const issues = exportDiagnostics(capture([f, p]));
  expect(issues.map((i) => i.code)).toEqual([
    'missing-item',
    'invalid-attachment-type',
    'missing-support',
  ]);
  expect(issues.every((i) => i.actorPaths.length === 1 && i.actorPaths[0] === p.actorPath)).toBe(
    true,
  );
});
it('links a zero-scale support error to both the trap and its actual support', () => {
  const f = floor();
  f.transform.scale[2] = 0;
  const p: Placement = {
    ...floor(),
    kind: 'trap',
    itemPath: '/trap',
    attachmentType: 2,
    attachment: { status: 'resolved', supportActorPath: f.actorPath, side: 1 },
  };
  const issues = exportDiagnostics(capture([f, p]));
  expect(issues).toHaveLength(1);
  expect(issues[0]).toMatchObject({
    code: 'zero-scale-support',
    actorPaths: [p.actorPath, f.actorPath],
  });
  expect(() => exportCapture(capture([f, p]))).toThrow(/zero scale/);
});
it('handles document-wide and duplicate-identity errors without inventing locations', () => {
  expect(exportDiagnostics(capture([]))).toEqual([
    { code: 'empty-blueprint', message: 'Blueprint has no build placements.', actorPaths: [] },
  ]);
  const f = floor();
  expect(exportDiagnostics(capture([f, structuredClone(f)]))[0]).toMatchObject({
    code: 'duplicate-actor',
    actorPaths: [f.actorPath],
  });
});
it('reports invalid actor and mesh transforms separately, and clears when fixed', () => {
  const f = floor();
  f.transform.rotation = [0, 0, 0, 0];
  f.meshTransform.rotation = [0, 0, 0, 0];
  expect(exportDiagnostics(capture([f])).map((i) => i.message)).toEqual([
    'Actor has an invalid transform.',
    'Mesh has an invalid transform.',
  ]);
  f.transform.rotation = [0, 0, 0, 1];
  f.meshTransform.rotation = [0, 0, 0, 1];
  expect(exportDiagnostics(capture([f]))).toEqual([]);
});
