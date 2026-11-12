// How the Action proves itself and posts. OIDC first (audience 'designbits'), a key as the fallback.

export const AUDIENCE = 'designbits';

export async function oidcToken(env, fetchFn) {
  const url = env.ACTIONS_ID_TOKEN_REQUEST_URL, tok = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !tok) return null;
  const r = await fetchFn(`${url}${url.includes('?') ? '&' : '?'}audience=${AUDIENCE}`, { headers: { authorization: `Bearer ${tok}` } });
  if (!r.ok) throw new Error(`OIDC ${r.status}`);
  return (await r.json()).value || null;
}

// auth is { oidc } or { key }; returns { status, json }
export async function post(endpoint, body, auth, fetchFn, ms = 20000) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  try {
    const headers = { 'content-type': 'application/json' };
    if (auth.oidc) headers.authorization = `Bearer ${auth.oidc}`; else if (auth.key) headers['x-designbits-key'] = auth.key;
    const r = await fetchFn(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal });
    const json = await r.json().catch(() => ({}));
    return { status: r.status, ok: r.ok, json };
  } finally { clearTimeout(timer); }
}
