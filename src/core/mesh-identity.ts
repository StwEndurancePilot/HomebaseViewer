export function meshStem(path: string): string {
  return (path.split('.').pop() || path.split('/').pop() || '').toLowerCase();
}
export function meshIdentity(path: string): {
  library: 'build' | 'trap';
  key: string;
} | null {
  const stem = meshStem(path);
  const build = /^pbw_([wbm][123]_[a-z0-9_]+)$/.exec(stem);
  if (build) return { library: 'build', key: stem };
  return stem ? { library: 'trap', key: stem } : null;
}
