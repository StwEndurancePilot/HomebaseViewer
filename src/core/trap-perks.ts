import type { Placement } from './save';
import { describePerk, trapPerks } from './requirements';
import options from '../data/trap-perk-options.json';

export const trapPerkOptions = options.groups.map((group) => ({
  label: group.label,
  perks: group.paths.map(describePerk),
}));
const allowedPaths = new Set(trapPerkOptions.flatMap((group) => group.perks.map((p) => p.path)));

export function withTrapPerks(source: Placement, paths: string[]): Placement {
  if (source.kind !== 'trap' || source.captureRole !== 'placement')
    throw new Error('Select a player-placed trap to edit its perks.');
  const saved = trapPerks(source),
    original = saved.perks.map((p) => p.path);
  if (paths.length > Math.max(6, original.length))
    throw new Error('A trap can have up to six perk slots.');
  if (paths.some((path) => !path || (!allowedPaths.has(path) && !original.includes(path))))
    throw new Error('Choose a perk for every slot, or remove the empty slot.');
  if (
    saved.state !== 'unknown' &&
    saved.state !== 'unreadable' &&
    paths.length === original.length &&
    paths.every((path, i) => path === original[i])
  )
    return source;
  const result: Placement = {
    ...source,
    trapPerks: paths.length ? `perks1;${paths.join(';')}` : '',
    trapPerksStatus: paths.length ? 'captured' : 'empty',
    trapPerksSource: 'editor',
  };
  delete result.trapEffectSources;
  delete result.perkReadProbe;
  return result;
}
