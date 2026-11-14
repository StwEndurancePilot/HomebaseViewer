import { isMenuSave, parseCapture, validateCapture, type Capture } from '../core/save';
import { convertCloudSave } from './convert';
import { convertPlacementJson, jsonPlacements } from './json-import';

export function inferZone(...hints: unknown[]): string | null {
  const zones = new Set<string>();
  for (const hint of hints) {
    if (typeof hint !== 'string') continue;
    const text = hint.toLowerCase();
    for (const [zone, pattern] of [
      ['pve_01', /stone[ _-]*wood|pve_01/],
      ['pve_02', /plankerton|pve_02/],
      ['pve_03', /canny[ _-]*valley|pve_03/],
      ['pve_04', /twine[ _-]*peaks|pve_04/],
    ] as const)
      if (pattern.test(text)) zones.add(zone);
  }
  return zones.size === 1 ? [...zones][0] : null;
}

export async function importLocalFile(
  bytes: Uint8Array,
  filename: string,
  options: { zoneId?: string; decode?: (bytes: Uint8Array) => Promise<Uint8Array> } = {},
): Promise<Capture | null> {
  if (bytes.length > 128 * 1024 * 1024)
    throw new Error('Homebase files must be 128 MiB or smaller.');
  if (isMenuSave(bytes)) return parseCapture(bytes);
  const header = new TextDecoder('latin1').decode(bytes.subarray(0, 65536));
  const compressed = header.startsWith('ECFD') || (bytes[0] === 31 && bytes[1] === 139);
  const prefix = new TextDecoder().decode(bytes.subarray(0, 65536)).trimStart();
  if (prefix.startsWith('{') || prefix.startsWith('[')) {
    let source: unknown;
    try {
      source = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''),
      );
    } catch {
      throw new Error(
        'This JSON is incomplete or invalid. Save the full response body and try again.',
      );
    }
    if (
      Array.isArray(source) &&
      (!source.length ||
        source.every(
          (f) =>
            f &&
            typeof f === 'object' &&
            (typeof f.filename === 'string' || typeof f.uniqueFilename === 'string'),
        ))
    )
      throw new Error(
        'This is the cloud-storage file list, not a homebase. Download a homebase file using its filename in the second API call, save the response as a binary file (.sav), then open that file here. No viewer sign-in is needed.',
      );
    const metadata = source as Record<string, unknown> | null;
    if (metadata && typeof metadata.errorCode === 'string')
      throw new Error(
        'This file contains an Epic API error, not a homebase. Download a successful file response and try again.',
      );
    const rows = jsonPlacements(source);
    if (rows) {
      const zone =
        options.zoneId ??
        inferZone(metadata?.worldPath, metadata?.zoneId, metadata?.zone, filename);
      if (!zone) return null;
      return convertPlacementJson(source, rows, zone, filename);
    }
    return validateCapture(source);
  }
  if (compressed || header.includes('SavedActors') || header.includes('++Fortnite+Release')) {
    const zone = options.zoneId ?? inferZone(filename);
    if (!zone) return null;
    if (compressed && !options.decode)
      throw new Error('Open this compressed cloud download in the desktop app.');
    const decoded = compressed ? await options.decode!(bytes) : bytes;
    return convertCloudSave(decoded, zone, filename);
  }
  throw new Error(
    'Choose a homebase .sav/.asv download, capture JSON, or placement JSON. Save the second API response as binary; converting its bytes to text loses data.',
  );
}
