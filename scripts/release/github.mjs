export async function github(endpoint, options = {}) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error('A GitHub Actions token is required.');
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}): ${endpoint}`);
  return response;
}

export async function releases(repository) {
  const result = [];
  for (let page = 1; ; page++) {
    const rows = await (
      await github(
        `/repos/${repository.owner}/${repository.repo}/releases?per_page=100&page=${page}`,
      )
    ).json();
    result.push(...rows);
    if (rows.length < 100) return result;
  }
}
