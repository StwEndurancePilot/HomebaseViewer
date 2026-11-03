import data from '../data/trap-catalog.json';
import type { Placement, Pose } from './save';

export const trapCatalog = data.traps.sort((a, b) => a.name.localeCompare(b.name));

export function trapTemplate(id: string, rarity: string): Placement {
  const trap = trapCatalog.find((t) => t.id === id),
    variant = trap?.variants.find((v) => v.rarity === rarity);
  if (!variant) throw new Error('Choose an available trap and rarity.');
  const pose: Pose = { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
  return {
    actorPath: `/HomebaseEditor/Templates/${id}/${rarity}`,
    kind: 'trap',
    captureRole: 'placement',
    classPath: variant.classPath,
    itemPath: variant.itemPath,
    meshPath: variant.meshPath,
    transform: pose,
    meshTransform: structuredClone(variant.meshRelative) as Pose,
    attachmentType: variant.attachmentType,
    buildingType: 10,
    resourceType: 6,
    level: 0,
    trapLevel: variant.tier * 10,
    trapPerks: variant.perks.length ? `perks1;${variant.perks.join(';')}` : '',
    trapPerksStatus: variant.perks.length ? 'captured' : 'empty',
    trapPerksSource: 'editor-default',
    mirrored: false,
  };
}
