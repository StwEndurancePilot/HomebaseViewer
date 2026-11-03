import type { Capture } from './save';

export const BASE_ZONES = {
  pve_01: { name: 'Stonewood', map: 'Stonewood' },
  pve_02: { name: 'Plankerton', map: 'Plankerton' },
  pve_03: { name: 'Canny Valley', map: 'CannyValley' },
  pve_04: { name: 'Twine Peaks', map: 'TwinePeaks' },
  blank: { name: 'Blank grid', map: '' },
};

export function newBase(zone: string, current?: Capture): Capture {
  const choice = BASE_ZONES[zone as keyof typeof BASE_ZONES];
  if ((!choice && zone !== 'current') || (zone === 'current' && !current))
    throw new Error('Choose a map for the new base.');
  return {
    schemaVersion: 6,
    format: 'stw-homebase-capture',
    coordinateUnit: 'unreal-world-units',
    rotationEncoding: 'quaternion-xyzw',
    worldPath:
      zone === 'current'
        ? current!.worldPath
        : choice.map
          ? `/STW_Zones/Maps/Zones/Outpost/Zone_Outpost_${choice.map}.Zone_Outpost_${choice.map}`
          : 'Custom-blueprint',
    placements: [],
    capturedCount: 0,
    completeHomebase: false,
  };
}
