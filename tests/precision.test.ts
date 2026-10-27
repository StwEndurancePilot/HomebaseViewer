import { describe, it, expect } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { decodeNumber, parseCapture, readSaveText, type Pose } from '../src/core/save';
import { sceneMatrix, scenePoint } from '../src/core/transforms';
import { meshIdentity } from '../src/core/mesh-identity';
const pose: Pose = {
  translation: [512.0000000000001, -19.1234567890123, 768.0000000000001],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
};
function capture() {
  return {
    format: 'stw-homebase-capture',
    schemaVersion: 6,
    coordinateUnit: 'unreal-world-units',
    rotationEncoding: 'quaternion-xyzw',
    capturedCount: 1,
    completeHomebase: false,
    worldPath: 'Zone_Outpost_Stonewood',
    placements: [
      {
        kind: 'structure',
        captureRole: 'placement',
        actorPath: 'Actor.1',
        classPath: 'Class',
        meshPath: '/PBW_W1_Floor.PBW_W1_Floor',
        transform: { ...pose, translation: [0, 0, 0] },
        meshTransform: pose,
      },
    ],
  };
}
function save(text: string, wide: boolean) {
  const header = Buffer.concat([
    Buffer.from('GVAS'),
    Buffer.alloc(80),
    Buffer.from('/Script/ExtractionCoreRuntime.SpriteSaveGame\0'),
  ]);
  const marker = Buffer.from('\x11\0\0\0ExternalDataJson\0\x0c\0\0\0StrProperty\0');
  const content = Buffer.from(text + '\0', wide ? 'utf16le' : 'utf8'),
    prop = Buffer.alloc(13);
  prop.writeInt32LE(content.length + 4, 4);
  prop.writeInt32LE(wide ? -(text.length + 1) : content.length, 9);
  return Buffer.concat([
    header,
    marker,
    prop,
    content,
    Buffer.from([5, 0, 0, 0, 78, 111, 110, 101, 0, 0, 0, 0, 0]),
  ]);
}
describe('SpriteSaveGame import', () => {
  for (const wide of [false, true])
    it(`reads ${wide ? 'UTF16' : 'UTF8'} without changing sub-cell doubles`, () => {
      const text = 'STW_HOMEBASE_1\n' + JSON.stringify(capture()) + '\n';
      const bytes = save(text, wide);
      expect(readSaveText(bytes)).toBe(text);
      const loaded = parseCapture(bytes);
      expect(loaded.placements[0].meshTransform.translation).toEqual(pose.translation);
      expect(loaded.placements[0].transform.translation).toEqual([0, 0, 0]);
    });
  it('rejects truncated saves, wrong containers, settings and invalid numbers', () => {
    const bytes = save('STW_HOMEBASE_1\n' + JSON.stringify(capture()) + '\n', false);
    expect(() => parseCapture(bytes.subarray(0, -1))).toThrow();
    expect(() => parseCapture(save('STW_LIBRARY_1\n', false))).toThrow(/library/);
    const bad = capture();
    bad.placements[0].meshTransform = { ...pose, rotation: [0, 0, 0, 2] };
    expect(() => parseCapture(Buffer.from(JSON.stringify(bad)))).toThrow(/quaternion/);
    const unsupported = capture();
    unsupported.schemaVersion = 99;
    expect(() => parseCapture(Buffer.from(JSON.stringify(unsupported)))).toThrow(/schema/);
  });
  it('rejects mismatched record counts and duplicate actor identities', () => {
    const data = capture();
    data.capturedCount = 2;
    expect(() => parseCapture(Buffer.from(JSON.stringify(data)))).toThrow(/count/);
    data.placements.push(data.placements[0]);
    expect(() => parseCapture(Buffer.from(JSON.stringify(data)))).toThrow(/Duplicate/);
  });
  it('rejects partial replay rows', () =>
    expect(() =>
      parseCapture(
        save('STW_HOMEBASE_1\n' + JSON.stringify(capture()) + '\nplacement|trap', false),
      ),
    ).toThrow(/replay/));
});
describe('exact schema-6 binary transport', () => {
  it('decodes one ULP, negative components, minimum subnormal and maximum finite', () => {
    expect(decodeNumber('binary64:67108864:1:0')).toBe(1.0000000000000002);
    expect(decodeNumber('binary64:-67108864:-1:0')).toBe(-1.0000000000000002);
    expect(decodeNumber('binary64:67108864:0:-1074')).toBe(Number.MIN_VALUE);
    expect(decodeNumber('binary64:134217727:67108863:1023')).toBe(Number.MAX_VALUE);
  });
  it('rejects underflow loss, nonnormalized integers and mixed signs', () => {
    for (const s of [
      'binary64:0:0:0',
      'binary64:67108864:1:-1074',
      'binary64:-67108864:1:0',
      'binary64:67108864:0:1024',
    ])
      expect(() => decodeNumber(s)).toThrow();
  });
});
describe('Unreal → Penny basis', () => {
  it('preserves the exact unsnapped pivot and permutes all scale axes', () => {
    const p = { ...pose, scale: [-2, 0.125, 3.5] as [number, number, number] };
    const m = sceneMatrix(p);
    expect(m.elements.slice(12, 15)).toEqual(scenePoint(p.translation).toArray());
    expect(m.elements[0]).toBe(0.125);
    expect(m.elements[5]).toBe(3.5);
    expect(m.elements[10]).toBe(-2);
  });
  it('matches independent UE world-point evaluation for compound rotations, reflections and nonuniform scales', () => {
    const rotations = [
      new Quaternion(),
      new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI),
      new Quaternion().setFromAxisAngle(new Vector3(0.3, -0.7, 0.4).normalize(), 1.234567891),
    ];
    for (const q of rotations)
      for (const scale of [
        [1, 1, 1],
        [-2, 0.3, 4],
        [-0.5, -1.2, 2],
      ])
        for (const point of [
          [1, 2, 3],
          [256.125, -128.75, 383.999],
          [0, 0, 0],
        ]) {
          const p: Pose = {
            ...pose,
            rotation: q.toArray() as Pose['rotation'],
            scale: scale as Pose['scale'],
          };
          const ueWorld = new Vector3(...point)
            .multiply(new Vector3(...scale))
            .applyQuaternion(q)
            .add(new Vector3(...p.translation));
          const expected = scenePoint(ueWorld.toArray());
          const actual = scenePoint(point).applyMatrix4(sceneMatrix(p));
          expect(actual.distanceTo(expected)).toBeLessThan(3e-14);
        }
  });
  it('90-degree UE yaw maps forward to right', () => {
    const p: Pose = {
      translation: [0, 0, 0],
      rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
      scale: [1, 1, 1],
    };
    expect(
      scenePoint([512, 0, 0])
        .applyMatrix4(sceneMatrix(p))
        .distanceTo(new Vector3(1, 0, 0)),
    ).toBeLessThan(1e-14);
  });
});
it('matches exact source meshes, never inferring a missing mesh from a class', () => {
  expect(meshIdentity('/Game/PBW_B3_Floor.PBW_B3_Floor')).toEqual({
    library: 'build',
    key: 'pbw_b3_floor',
  });
  expect(meshIdentity('/Trap/SM_Wall_Launcher_Trap_Base.SM_Wall_Launcher_Trap_Base')).toEqual({
    library: 'trap',
    key: 'sm_wall_launcher_trap_base',
  });
  expect(meshIdentity('')).toBeNull();
});
