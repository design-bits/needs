// A pull_request event as the request body the server takes. The PR body is kept for reading ticks and is not sent as text.
// On `edited`, GitHub sends the body as it was before under `changes.body.from`, and only when the body changed (a title edit
// carries none): `before` holds it, so the ticks this edit flipped can be told from the ones already there.

export const fromEvent = (payload = {}, eventName = 'pull_request') => {
  const pr = payload.pull_request || {}, from = payload.changes?.body?.from;
  return {
    repo: payload.repository?.full_name || '',
    number: pr.number ?? payload.number ?? null,
    title: pr.title || '',
    branch: pr.head?.ref || '',
    url: pr.html_url || '',
    author: pr.user?.login || '',
    sender: payload.sender?.login || '',
    merged: !!pr.merged,
    state: pr.state || '',
    createdAt: pr.created_at || '',
    mergedAt: pr.merged_at || '',
    event: eventName === 'workflow_dispatch' ? 'dispatch' : payload.action || '',
    body: pr.body || '',
    // a body that was empty before arrives as null; it still changed
    before: typeof from === 'string' ? from : from === null && payload.changes?.body ? '' : null,
  };
};
