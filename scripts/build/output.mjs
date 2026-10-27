import path from 'node:path';

export function releaseDirectory(version) {
  return path.resolve(process.env.HOMEBASE_BUILD_OUTPUT || `artifacts/releases/${version}`);
}
