import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Quaternion, Vector3 } from 'three';
const root = path.resolve(process.argv[2] ?? 'artifacts/asset-tools/recovered');
const output = 'assets/outpost-game/recovered-traps';
const files = fs.readdirSync(root, { recursive: true }).map((f) => path.join(root, f));
const find = (name) => {
  const matches = files.filter((f) => path.basename(f) === name);
  if (matches.length !== 1) throw new Error(`Expected one ${name}, found ${matches.length}`);
  return matches[0];
};
const sha = (b) => createHash('sha256').update(b).digest('hex');
const sources = [];
const read = (name) => {
  const data = fs.readFileSync(find(name));
  sources.push({ file: name, sha256: sha(data) });
  return data;
};
const gltf = {
  asset: { version: '2.0', generator: 'Homebase Viewer native trap recovery' },
  scene: 0,
  scenes: [{ nodes: [] }],
  nodes: [],
  meshes: [],
  materials: [],
  accessors: [],
  bufferViews: [],
  buffers: [],
  images: [],
  textures: [],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
};
const buffers = [];
let length = 0;
function append(data) {
  const offset = length;
  buffers.push(data);
  length += data.length;
  const padding = (4 - (length % 4)) % 4;
  if (padding) {
    buffers.push(Buffer.alloc(padding));
    length += padding;
  }
  return offset;
}
const textures = new Map();
function texture(name) {
  if (textures.has(name)) return textures.get(name);
  const data = read(name),
    view = gltf.bufferViews.length;
  gltf.bufferViews.push({ buffer: 0, byteOffset: append(data), byteLength: data.length });
  const source = gltf.images.length;
  gltf.images.push({ name, mimeType: 'image/png', bufferView: view });
  const index = gltf.textures.length;
  gltf.textures.push({ sampler: 0, source });
  textures.set(name, index);
  return index;
}
const materialMaps = {
  M_FloorHealthBase2: ['Floor_Health_D.png', 'Floor_Health_N.png'],
  MI_FORT_Flame_Grill_Trap_Inst: ['T_Flame_Grill_Trap_D.png', 'T_Flame_Grill_Trap_N.png'],
  MI_Patrol_Ward_Trap: [
    'T_Patrol_Ward_Trap_D.png',
    'T_Patrol_Ward_Trap_N.png',
    'T_Patrol_Ward_Trap_E.png',
  ],
  M_Turret_Gun: ['T_Turret_Gun_D.png', 'T_Turret_Gun_N.png', 'T_Turret_Gun_E.png'],
  M_Turret_Ammo_Counter: ['T_Battery_Charge.png'],
};
const materialIds = new Map();
function material(name) {
  if (materialIds.has(name)) return materialIds.get(name);
  const maps = materialMaps[name];
  if (!maps) throw new Error(`Unmapped material ${name}`);
  const item = {
    name,
    pbrMetallicRoughness: {
      baseColorTexture: { index: texture(maps[0]) },
      metallicFactor: 0,
      roughnessFactor: 0.85,
    },
    extras: { unrealNormalY: true, sourceMaterial: name },
  };
  if (maps[1]) item.normalTexture = { index: texture(maps[1]) };
  if (maps[2]) {
    item.emissiveTexture = { index: texture(maps[2]) };
    item.emissiveFactor = [1, 1, 1];
  }
  const index = gltf.materials.length;
  gltf.materials.push(item);
  materialIds.set(name, index);
  return index;
}
function mesh(name) {
  const bytes = read(name + '.glb'),
    jsonLength = bytes.readUInt32LE(12),
    src = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  const binStart = 20 + jsonLength,
    bin = bytes.subarray(binStart + 8, binStart + 8 + bytes.readUInt32LE(binStart));
  if (
    src.nodes.length !== 1 ||
    src.nodes[0].matrix ||
    src.nodes[0].translation ||
    src.nodes[0].rotation ||
    src.nodes[0].scale
  )
    throw new Error('Unexpected source mesh transform');
  const byteBase = append(bin),
    viewBase = gltf.bufferViews.length,
    accessorBase = gltf.accessors.length;
  for (const view of src.bufferViews)
    gltf.bufferViews.push({ ...view, buffer: 0, byteOffset: byteBase + (view.byteOffset ?? 0) });
  for (const accessor of src.accessors) {
    if (accessor.sparse) throw new Error('Unexpected sparse accessor');
    gltf.accessors.push({ ...accessor, bufferView: accessor.bufferView + viewBase });
  }
  if (src.meshes.length !== 1) throw new Error('Expected one source mesh');
  const original = src.meshes[0],
    index = gltf.meshes.length;
  gltf.meshes.push({
    name,
    primitives: original.primitives.map((p) => ({
      ...p,
      indices: p.indices + accessorBase,
      attributes: Object.fromEntries(
        Object.entries(p.attributes).map(([k, v]) => [
          k === 'COLOR_0' ? '_UE_COLOR_0' : k,
          v + accessorBase,
        ]),
      ),
      material: material(src.materials[p.material].name),
    })),
  });
  const node = gltf.nodes.length;
  gltf.nodes.push({ name, mesh: index });
  return node;
}
function group(name, children) {
  const index = gltf.nodes.length;
  gltf.nodes.push({
    name,
    children,
    rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
    scale: [100 / 512, 100 / 512, 100 / 512],
  });
  gltf.scenes[0].nodes.push(index);
}
group('s_floor_healthsquare', [mesh('S_Floor_HealthSquare')]);
group('sm_flame_grill_trap', [mesh('SM_Flame_Grill_Trap')]);
const bp = JSON.parse(read('Trap_Floor_Ward_AntiAir.json'));
function component(name, node) {
  const record = bp.find((p) => p.Name === name);
  if (!record) throw new Error(`Missing blueprint component ${name}`);
  const p = record.Properties ?? {},
    l = p.RelativeLocation ?? { X: 0, Y: 0, Z: 0 },
    r = p.RelativeRotation ?? { Pitch: 0, Yaw: 0, Roll: 0 },
    s = p.RelativeScale3D ?? { X: 1, Y: 1, Z: 1 };
  const angle = Math.PI / 180,
    q = new Quaternion()
      .setFromAxisAngle(new Vector3(0, 0, 1), r.Yaw * angle)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -r.Pitch * angle))
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -r.Roll * angle));
  Object.assign(gltf.nodes[node], {
    translation: [l.X / 100, l.Z / 100, l.Y / 100],
    rotation: [q.x, q.z, q.y, -q.w],
    scale: [s.X, s.Z, s.Y],
  });
  return { name, mesh: p.StaticMesh, translation: l, rotation: r, scale: s };
}
const base = mesh('Patrol_Ward_Trap_base'),
  core = mesh('Patrol_Ward_Trap_core'),
  head = mesh('Patrol_Ward_Trap_turrethead'),
  ammo = mesh('SM_Turret_Gun_Ammo');
const components = [
  component('StaticMeshComponent0', base),
  component('TurretBody_GEN_VARIABLE', core),
  component('TurretGun_GEN_VARIABLE', head),
  component('SM_Turret_Gun_AmmoCounter_GEN_VARIABLE', ammo),
];
const scs = bp.filter((p) => p.Type === 'SCS_Node'),
  refName = (ref) => bp[Number(ref.ObjectPath.split('.').at(-1))]?.Name;
const scsCore = scs.find(
  (n) => refName(n.Properties.ComponentTemplate) === 'TurretBody_GEN_VARIABLE',
);
const scsHead = scs.find(
  (n) => refName(n.Properties.ComponentTemplate) === 'TurretGun_GEN_VARIABLE',
);
const scsAmmo = scs.find(
  (n) => refName(n.Properties.ComponentTemplate) === 'SM_Turret_Gun_AmmoCounter_GEN_VARIABLE',
);
if (
  scsCore.Properties.ParentComponentOrVariableName !== 'StaticMeshComponent0' ||
  !scsCore.Properties.ChildNodes.some((r) => refName(r) === scsHead.Name) ||
  !scsHead.Properties.ChildNodes.some((r) => refName(r) === scsAmmo.Name)
)
  throw new Error('Anti-air hierarchy changed');
gltf.nodes[head].children = [ammo];
gltf.nodes[core].children = [head];
gltf.nodes[base].children = [core];
group('patrol_ward_trap_base', [base]);
gltf.buffers = [{ byteLength: length }];
const json = Buffer.from(JSON.stringify(gltf)),
  jsonPadded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
json.copy(jsonPadded);
const binary = Buffer.concat(buffers),
  header = Buffer.alloc(12),
  jsonHeader = Buffer.alloc(8),
  binHeader = Buffer.alloc(8);
header.write('glTF');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binary.length, 8);
jsonHeader.writeUInt32LE(jsonPadded.length);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
binHeader.writeUInt32LE(binary.length);
binHeader.writeUInt32LE(0x004e4942, 4);
const result = Buffer.concat([header, jsonHeader, jsonPadded, binHeader, binary]);
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'traps.glb'), result);
fs.writeFileSync(
  path.join(output, 'provenance.json'),
  JSON.stringify(
    {
      source: 'Locally installed Fortnite 42.40 assets, read-only extraction',
      extractor: 'CUE4Parse-Conversion 1.2.2.202610',
      sources,
      outputSha256: sha(result),
      coordinates:
        'Native mesh pivots; CUE GLTF metres transformed to (UE Y, UE Z, -UE X)/512. No centering or seating offsets.',
      antiAirComponents: components,
      limitations: [
        'Anti-air uses blueprint default component poses; live turret aim and charge state are not saved.',
        'Original diffuse/normal/emissive textures with static PBR approximation; Unreal animated materials and effects are not reproduced.',
      ],
    },
    null,
    2,
  ),
);
console.log(
  `Packed ${gltf.meshes.length} original meshes, ${gltf.images.length} embedded textures: ${result.length} bytes.`,
);
