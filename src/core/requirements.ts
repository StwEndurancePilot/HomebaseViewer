import type { Capture, Placement } from './save';
import { meshStem } from './mesh-identity';
import perkData from '../data/perks.json';
const perkCatalog = perkData as Record<
  string,
  {
    description: string;
    rarity: string | null;
  }
>;
export function trapTypeKey(p: Placement): string {
  return meshStem(p.classPath || p.meshPath || p.itemPath || '').replace(/_c$/, '');
}
export function trapName(p: Placement): string {
  const stem = trapTypeKey(p);
  const names: Record<string, string> = {
    trap_floor_launcher: 'Floor Launcher',
    trap_floor_freeze: 'Floor Freeze',
    trap_floor_tar: 'Tar Pit',
    trap_floor_spikes: 'Retractable Floor Spikes',
    trap_floor_spikes_wood: 'Wooden Floor Spikes',
    trap_floor_flamegrill: 'Flame Grill',
    trap_floor_ward_antiair: 'Anti-Air Trap',
    trap_ceiling_gas: 'Ceiling Gas',
    trap_ceiling_falling: 'Ceiling Drop',
    trap_ceiling_electric: 'Ceiling Electric Field',
    trap_ceiling_electricweak: 'Ceiling Zapper',
    trap_wall_launcher: 'Wall Launcher',
    trap_wall_darts: 'Wall Darts',
    trap_wall_electric: 'Wall Dynamo',
    trap_wall_light: 'Wall Lights',
    trap_wall_speaker: 'Sound Wall',
    trap_wall_cannons: 'Broadside',
    trap_wall_mechstructor: 'Wall Healing',
    trap_wall_spikes: 'Wall Spikes',
  };
  if (stem.startsWith('trap_floor_health')) return 'Healing Pad';
  return (
    names[stem] ??
    stem
      .replace(/^trap_/, '')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
export type SavedPerk = {
  path: string;
  label: string;
  rarity: string | null;
  known: boolean;
};
export function describePerk(path: string): SavedPerk {
  const leaf = path.split('.').at(-1)!.split('/').at(-1)!,
    known = perkCatalog['alteration:' + leaf.toLowerCase()];
  return {
    path,
    label: known?.description ?? leaf,
    rarity: known?.rarity ?? null,
    known: Boolean(known),
  };
}
export function trapPerks(p: Placement): {
  state: 'recorded' | 'observed' | 'empty' | 'unknown' | 'unreadable';
  perks: SavedPerk[];
} {
  const raw = typeof p.trapPerks === 'string' ? p.trapPerks : '';
  if (!raw)
    return {
      state:
        p.trapPerksStatus === 'empty' || p.trapPerksStatus === 'captured' ? 'empty' : 'unknown',
      perks: [],
    };
  if (!raw.startsWith('perks1;')) return { state: 'unreadable', perks: [] };
  const paths = raw.slice(7).split(';').filter(Boolean);
  return {
    state: paths.length
      ? p.trapPerksStatus === 'observed-effects'
        ? 'observed'
        : 'recorded'
      : p.trapPerksStatus === 'observed-effects'
        ? 'unknown'
        : 'empty',
    perks: paths.map(describePerk),
  };
}
export function trapVariantKey(p: Placement): string {
  const perks = trapPerks(p);
  return JSON.stringify([
    (p.itemPath ?? '').split('.').at(-1)?.toLowerCase(),
    p.trapLevel ?? null,
    perks.state,
    perks.perks.map((p) => p.path.split('.').at(-1)!.toLowerCase()),
    perks.state === 'unreadable' ? p.trapPerks : null,
  ]);
}
export type TrapVariant = {
  key: string;
  sample: Placement;
  records: Placement[];
};
export type TrapRequirement = {
  key: string;
  name: string;
  records: Placement[];
  variants: TrapVariant[];
};
export type Requirements = {
  materials: [number, number, number];
  materialPieces: [number, number, number];
  unknownStructures: number;
  structures: number;
  traps: number;
  types: TrapRequirement[];
};
export function requirements(data: Capture): Requirements {
  const result: Requirements = {
    materials: [0, 0, 0],
    materialPieces: [0, 0, 0],
    unknownStructures: 0,
    structures: 0,
    traps: 0,
    types: [],
  };
  const types = new Map<string, TrapRequirement>(),
    variants = new Map<string, Map<string, TrapVariant>>();
  for (const p of data.placements) {
    if (p.captureRole !== 'placement') continue;
    if (p.kind === 'structure') {
      result.structures++;
      const material = Number(p.resourceType),
        level = Number(p.level ?? 0);
      if (
        !Number.isInteger(material) ||
        material < 0 ||
        material > 2 ||
        !Number.isInteger(level) ||
        level < 0 ||
        level > 2
      ) {
        result.unknownStructures++;
        continue;
      }
      result.materials[material] += [10, 30, 60][level];
      result.materialPieces[material]++;
      continue;
    }
    result.traps++;
    const key = trapTypeKey(p);
    if (!types.has(key)) {
      types.set(key, { key, name: trapName(p), records: [], variants: [] });
      variants.set(key, new Map());
    }
    const group = types.get(key)!;
    group.records.push(p);
    const variant = trapVariantKey(p),
      byVariant = variants.get(key)!;
    if (!byVariant.has(variant)) {
      const entry = { key: variant, sample: p, records: [] };
      byVariant.set(variant, entry);
      group.variants.push(entry);
    }
    byVariant.get(variant)!.records.push(p);
  }
  result.types = [...types.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key),
  );
  return result;
}
