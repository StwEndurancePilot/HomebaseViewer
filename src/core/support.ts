import type { Placement } from './save';

export type MapSurfaceReference = {
  source: 'bundled-map';
  zoneId: string;
  meshName: string;
};

export function mapSurfaceReference(p: Placement): MapSurfaceReference | null {
  const reference = p.editorMapSupport as Partial<MapSurfaceReference> | undefined;
  return p.kind === 'structure' &&
    p.captureRole === 'existing-world' &&
    reference?.source === 'bundled-map' &&
    /^pve_0[1-4]$/.test(reference.zoneId ?? '') &&
    typeof reference.meshName === 'string' &&
    isMapBuilding(reference.meshName) &&
    p.meshPath === reference.meshName &&
    p.classPath === ''
    ? (reference as MapSurfaceReference)
    : null;
}

export function isMapBuilding(name: string): boolean {
  return /^(?:S_Cave_|FORT_|S_Boardwalk_)/i.test(name);
}

export function isBuildingSupport(p: Placement | undefined): p is Placement {
  return Boolean(
    p &&
      p.kind === 'structure' &&
      (p.captureRole === 'placement' || p.captureRole === 'existing-world'),
  );
}

export function referencedWorldSupports(records: Placement[]): Set<string> {
  const ids = new Set<string>();
  for (const p of records) {
    if (p.captureRole !== 'placement' || p.kind !== 'trap') continue;
    const link = p.attachment as { supportActorPath?: string } | undefined;
    if (link?.supportActorPath) ids.add(link.supportActorPath);
  }
  return new Set(
    records
      .filter(
        (p) => p.captureRole === 'existing-world' && isBuildingSupport(p) && ids.has(p.actorPath),
      )
      .map((p) => p.actorPath),
  );
}
