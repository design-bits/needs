// GitHub reads and the one write (the PR body). Each takes the fetch function and token first so tests can mock them.
// Files come by GraphQL with path and line counts only: patches are never requested.

const API = 'https://api.github.com';
const head = token => ({ authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'designbits-needs' });
const gql = async (fetchFn, token, query, variables) => {
  const r = await fetchFn(`${API}/graphql`, { method: 'POST', headers: head(token), body: JSON.stringify({ query, variables }) });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const j = await r.json();
  if (j.errors?.length) throw new Error('GitHub query failed');
  return j.data;
};
const split = repo => repo.split('/');
const sum = files => ({ added: files.reduce((n, f) => n + (f.additions || 0), 0), removed: files.reduce((n, f) => n + (f.deletions || 0), 0), files: files.length });

export const FILES_QUERY = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) { pullRequest(number: $number) { files(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { path additions deletions } } } }
}`;

export async function filesOf(fetchFn, token, repo, number) {
  const [owner, name] = split(repo), files = [];
  let after = null;
  for (let i = 0; i < 30; i++) {
    const f = (await gql(fetchFn, token, FILES_QUERY, { owner, name, number, after })).repository?.pullRequest?.files;
    if (!f) break;
    files.push(...f.nodes);
    if (!f.pageInfo?.hasNextPage) break;
    after = f.pageInfo.endCursor;
  }
  return { paths: files.map(f => f.path), lines: sum(files) };
}

export async function permissionOf(fetchFn, token, repo, login) {
  try {
    const r = await fetchFn(`${API}/repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`, { headers: head(token) });
    if (!r.ok) return null;
    const p = (await r.json()).permission;
    return ['admin', 'write', 'read', 'none'].includes(p) ? p : null;
  } catch { return null; }
}

export const SEARCH_QUERY = `query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 50, after: $after) { pageInfo { hasNextPage endCursor } nodes { ... on PullRequest {
    number title headRefName url createdAt mergedAt additions deletions author { login } files(first: 100) { nodes { path additions deletions } } } } }
}`;

// merged PRs of the last `days` days, at most 200; paths are filtered by the caller
export async function recentMergedPRs(fetchFn, token, repo, days = 90) {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10), out = [];
  let after = null;
  for (let i = 0; i < 4 && out.length < 200; i++) {
    const s = (await gql(fetchFn, token, SEARCH_QUERY, { q: `repo:${repo} is:pr is:merged merged:>${since}`, after })).search;
    for (const n of s.nodes || []) if (n?.number) {
      const files = n.files?.nodes || [];
      out.push({ number: n.number, title: n.title, branch: n.headRefName, url: n.url, author: n.author?.login || '', createdAt: n.createdAt, mergedAt: n.mergedAt,
        paths: files.map(f => f.path), lines: sum(files) });
    }
    if (!s.pageInfo?.hasNextPage) break;
    after = s.pageInfo.endCursor;
  }
  return out.slice(0, 200);
}

export async function updateBody(fetchFn, token, repo, number, body) {
  const r = await fetchFn(`${API}/repos/${repo}/pulls/${number}`, { method: 'PATCH', headers: head(token), body: JSON.stringify({ body }) });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
}
