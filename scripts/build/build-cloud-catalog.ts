import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseCapture, readSaveText, type Pose } from '../../src/core/save';
import { relativePose } from '../../src/core/editor';
const dir = path.join(process.env.LOCALAPPDATA!, 'FortniteGame/Saved/SaveGames');
const classes: Record<string, any> = {},
  items: Record<string, string> = {},
  variants = new Map<
    string,
    Map<
      string,
      {
        value: any;
        count: number;
      }
    >
  >();
let template: Uint8Array | undefined,
  perkExample = '';
const canonical = (p: Pose): Pose => ({
  translation: p.translation.map((v) => (Math.abs(v) < 1e-7 ? 0 : v)) as Pose['translation'],
  rotation: p.rotation.map((v) =>
    Math.abs(v) < 1e-7 ? 0 : Math.abs(v - 1) < 1e-7 ? 1 : Math.abs(v + 1) < 1e-7 ? -1 : v,
  ) as Pose['rotation'],
  scale: p.scale.map((v) => (Math.abs(v - 1) < 1e-7 ? 1 : v)) as Pose['scale'],
});
for (const name of readdirSync(dir).filter(
  (n) => n.startsWith('STW_Homebase_') && n.endsWith('.sav') && !/Library|Recovery/.test(n),
)) {
  const bytes = new Uint8Array(readFileSync(path.join(dir, name))),
    data = parseCapture(bytes);
  template ??= bytes;
  for (const p of data.placements) {
    if (
      p.captureRole !== 'placement' ||
      !p.meshPath ||
      p.transform.scale.some((v) => Math.abs(v) < 1e-12)
    )
      continue;
    if (p.itemPath) items[p.itemPath.split('.').at(-1)!.toLowerCase()] = p.itemPath;
    if (!perkExample && p.trapPerks) perkExample = String(p.trapPerks);
    const key = p.classPath.toLowerCase() + '|' + Boolean(p.mirrored),
      value = {
        classPath: p.classPath,
        meshPath: p.meshPath,
        meshRelative: canonical(relativePose(p.meshTransform, p.transform)),
        attachmentType: p.attachmentType,
        buildingType: p.buildingType,
        resourceType: p.resourceType,
        level: p.level,
      };
    const signature = JSON.stringify(value, (_k, v) =>
        typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v,
      ),
      group = variants.get(key) ?? new Map();
    const variant = group.get(signature) ?? { value, count: 0 };
    variant.count++;
    group.set(signature, variant);
    variants.set(key, group);
  }
}
let ambiguous = 0;
for (const [key, group] of variants) {
  const sorted = [...group.values()].sort((a, b) => b.count - a.count);
  classes[key] = {
    ...sorted[0].value,
    observations: sorted.reduce((n, v) => n + v.count, 0),
    variants: sorted.length,
  };
  if (sorted.length > 1) ambiguous++;
}
if (!template) throw new Error('No native menu container available.');
const marker = new TextEncoder().encode('\x11\0\0\0ExternalDataJson\0\x0c\0\0\0StrProperty\0');
let at = -1;
for (let i = 0; i < 65537 && i < template.length; i++)
  if (marker.every((b, j) => template![i + j] === b)) {
    at = i;
    break;
  }
const textAt = at + marker.length + 9,
  sizeAt = textAt - 5;
const empty =
  'STW_HOMEBASE_1\n' +
  JSON.stringify({
    schemaVersion: 6,
    format: 'stw-homebase-capture',
    coordinateUnit: 'unreal-world-units',
    rotationEncoding: 'quaternion-xyzw',
    worldPath: '',
    completeHomebase: false,
    placements: [],
  }) +
  '\n';
const content = Buffer.from(empty + '\0', 'utf16le'),
  trailer = Buffer.from([5, 0, 0, 0, 78, 111, 110, 101, 0, 0, 0, 0, 0]),
  output = Buffer.concat([
    Buffer.from(template.subarray(0, textAt)),
    Buffer.alloc(4),
    content,
    trailer,
  ]);
output.writeInt32LE(content.length + 4, sizeAt);
output.writeInt32LE(-(empty.length + 1), textAt);
if (readSaveText(output) !== empty) throw new Error('Invalid sanitized template.');
mkdirSync('src/cloud', { recursive: true });
writeFileSync('src/cloud/catalog.json', JSON.stringify({ classes, items }));
writeFileSync(
  'src/cloud/menu-container.json',
  JSON.stringify({ base64: output.toString('base64'), format: 'STW_HOMEBASE_1', schema: 6 }),
);
console.log({
  classes: Object.keys(classes).length,
  items: Object.keys(items).length,
  ambiguousClasses: ambiguous,
  templateBytes: output.length,
  perkEncodingExample: perkExample,
});
