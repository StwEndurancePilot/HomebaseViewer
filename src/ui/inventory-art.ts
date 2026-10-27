import type { Placement } from '../core/save';
import { trapTypeKey } from '../core/requirements';
const artwork = import.meta.glob('../../assets/inventory/traps/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;
const aliases: Record<string, string> = {
  ceiling_electric: 'ceiling_electric_aoe',
  ceiling_electricweak: 'ceiling_electric_single',
  floor_ward_antiair: 'floor_ward',
  wall_spikes: 'wall_wood_spikes',
  floor_player_jump_free_direction_pad: 'floor_player_jump_pad_free_direction',
  floor_player_jump_pad: 'floor_player_jump_pad',
};
export function trapArtwork(p: Placement): string | undefined {
  let key = trapTypeKey(p).replace(/^trap_/, '');
  if (key.startsWith('floor_health')) key = 'floor_health';
  key = aliases[key] ?? key;
  return artwork[`../../assets/inventory/traps/${key}.png`];
}
export function trapRarity(p: Placement): string {
  const token = /_(UR|SR|VR|UC|R|C)(?:_|$)/i
    .exec((p.itemPath ?? '').split('.').at(-1) ?? '')?.[1]
    .toUpperCase();
  return (
    (
      {
        C: 'common',
        UC: 'uncommon',
        R: 'rare',
        VR: 'epic',
        SR: 'legendary',
        UR: 'mythic',
      } as Record<string, string>
    )[token ?? ''] ?? 'unknown'
  );
}
