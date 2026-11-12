// Design Bits needs: records a pull request and keeps its needs note. It never blocks a merge: every failure is a warning and exit 0.
/* global process */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { allowedPaths } from './lib/pathRules.mjs';
import { fromEvent } from './lib/event.mjs';
import { parseTicks, replaceNote } from './lib/ticks.mjs';
import { filesOf, permissionOf, recentMergedPRs, updateBody } from './lib/github.mjs';
import { oidcToken, post } from './lib/send.mjs';

export * from './lib/pathRules.mjs';
export * from './lib/event.mjs';
export * from './lib/ticks.mjs';
export * from './lib/github.mjs';
export * from './lib/send.mjs';

// the only keys a request may carry
export const BODY_KEYS = ['repo', 'project', 'number', 'title', 'branch', 'url', 'author', 'sender', 'senderPermission', 'merged', 'state', 'createdAt', 'mergedAt',
  'event', 'paths', 'lines', 'ticks', 'ticksBefore', 'backfill', 'prs'];
export const PR_KEYS = ['number', 'title', 'branch', 'url', 'author', 'createdAt', 'mergedAt', 'paths', 'lines'];
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));

export const list = s => String(s || '').split(/[\n,]/).map(x => x.trim()).filter(Boolean);
const input = (env, name) => (env[`INPUT_${name.toUpperCase()}`] ?? env[`INPUT_${name.replace(/-/g, '_').toUpperCase()}`] ?? '').trim();
const warn = (log, msg) => { log(`::warning::Design Bits needs: ${msg}`); };
// pull requests per backfill request
const BATCH = 50;

export async function run({ env = process.env, fetchFn = globalThis.fetch, readFile = p => readFileSync(p, 'utf8'), log = console.log } = {}) {
  try {
    const eventName = env.GITHUB_EVENT_NAME || 'pull_request';
    const payload = JSON.parse(readFile(env.GITHUB_EVENT_PATH));
    const rules = { allow: list(input(env, 'allow')), deny: list(input(env, 'deny')) };
    const token = input(env, 'github-token') || env.GITHUB_TOKEN || '';
    const endpoint = input(env, 'endpoint') || 'https://designbits.app/api/why/action';
    const days = Math.max(1, Math.min(365, Number(input(env, 'backfill-days')) || 90));
    const keep = paths => allowedPaths(paths, rules), project = input(env, 'project') || undefined;

    let auth = null;
    try { const oidc = await oidcToken(env, fetchFn); if (oidc) auth = { oidc }; } catch { /* fall back to the key */ }
    const key = input(env, 'key') || env.DESIGNBITS_KEY || '';
    if (!auth && key) auth = { key };
    if (!auth) return warn(log, 'no OIDC token (add `permissions: id-token: write`) and no key, so nothing was sent.');

    const ev = fromEvent(payload, eventName), dispatch = eventName === 'workflow_dispatch';
    if (!ev.repo) return warn(log, 'the event names no repository, so nothing was sent.');
    const out = { ...ev, project };
    delete out.body;
    delete out.before;

    if (ev.number) {
      const f = await filesOf(fetchFn, token, ev.repo, ev.number);
      out.paths = keep(f.paths);
      out.lines = f.lines;
      // the boxes now and before this edit, so the server acts only on the ones this sender flipped; an edit that left the
      // body alone (a title fix) sends none, so it confirms nothing
      if (ev.event === 'edited' && ev.before !== null) {
        out.ticks = parseTicks(ev.body);
        out.ticksBefore = parseTicks(ev.before);
        out.senderPermission = await permissionOf(fetchFn, token, ev.repo, ev.sender);
      }
    }
    // the merged pull requests of the last `days` days, sent in batches so no one request grows past the server's body limit
    const backfill = async () => {
      const prs = (await recentMergedPRs(fetchFn, token, ev.repo, days)).map(p => pick({ ...p, paths: keep(p.paths) }, PR_KEYS));
      for (let i = 0; i === 0 || i < prs.length; i += BATCH) {
        const r = await post(endpoint, pick({ repo: ev.repo, project, event: 'backfill', backfill: true, prs: prs.slice(i, i + BATCH) }, BODY_KEYS), auth, fetchFn);
        if (!r.ok) return warn(log, `the server answered ${r.status} to the backfill.`);
      }
      log(`Design Bits needs: sent ${prs.length} merged pull requests of the last ${days} days as possible matches.`);
    };
    if (!ev.number) {
      if (dispatch || env.DESIGNBITS_BACKFILL === '1') return backfill();
      return warn(log, 'the event names no pull request, so nothing was sent.');
    }

    const res = await post(endpoint, pick(out, BODY_KEYS), auth, fetchFn);
    if (!res.ok) return warn(log, `the server answered ${res.status}; the pull request was not recorded.`);
    if (typeof res.json.note === 'string' && res.json.note) {
      const next = replaceNote(ev.body, res.json.note);
      if (next !== ev.body) await updateBody(fetchFn, token, ev.repo, ev.number, next);
    }
    log(`Design Bits needs: recorded ${ev.repo}#${ev.number}.`);
    // the first run for a repo asks for the 90 days (the server says so with `backfill: true`), as does DESIGNBITS_BACKFILL=1
    if (res.json.backfill || env.DESIGNBITS_BACKFILL === '1') await backfill();
  } catch (e) {
    warn(log, `skipped (${e?.name === 'AbortError' ? 'timed out' : e?.message || 'error'}). This never blocks a merge.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run();
