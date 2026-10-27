export function parseVersion(value) {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

export function nextVersion(base, existing) {
  let highest = parseVersion(base);
  if (!highest) throw new Error('The package version must use X.Y.Z.');
  for (const value of existing) {
    const candidate = parseVersion(value);
    if (
      candidate &&
      candidate.some(
        (part, index) =>
          part > highest[index] && candidate.slice(0, index).every((v, i) => v === highest[i]),
      )
    )
      highest = candidate;
  }
  if (highest[2] >= 65535)
    throw new Error('Patch version reached the Windows limit. Increase the minor version.');
  return `${highest[0]}.${highest[1]}.${highest[2] + 1}`;
}
