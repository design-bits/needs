# Design Bits needs

A GitHub Action that records each pull request in Design Bits and adds a note listing the customer needs behind it. It never blocks a merge: every failure logs a warning and the step exits 0.

Setup in Design Bits writes this workflow for each repo, with the workspace id and the repo's deny list filled in.

## Workflow

```yaml
name: Needs
on:
  pull_request:
    types: [opened, edited, synchronize, closed]
  workflow_dispatch:

permissions:
  contents: read
  id-token: write
  pull-requests: write

jobs:
  needs:
    runs-on: ubuntu-latest
    steps:
      - uses: design-bits/needs@v1
        with:
          project: your-workspace-id
          deny: |
            infra/**
            **/billing/**
```

Link the repo in Design Bits first (Integrations, Setup). There is no secret to paste: the Action proves which repo it runs in with GitHub's signed OIDC token (audience `designbits`).

## Inputs

| Input | Default | |
|---|---|---|
| `project` | empty | Your workspace id from Setup. Needed only when more than one workspace links the repo; Setup always fills it in. |
| `deny` | empty | Globs, comma or newline separated, never sent. |
| `allow` | empty | Optional. When set, only matching paths are sent. |
| `endpoint` | `https://designbits.app/api/why/action` | |
| `key` | empty | Fallback when OIDC is unavailable. Also read from the `DESIGNBITS_KEY` environment variable. |
| `backfill-days` | `90` | Days of merged PRs sent on a first run or a manual run. |
| `github-token` | `${{ github.token }}` | Reads the PR's files and writes the note. |

## What is sent

PR number, title, branch, URL and dates, the author's and the sender's GitHub logins, whether it merged, the changed file paths after your lists have filtered them, line counts (added, removed, files), which need checkboxes are ticked and, on an edit that changed the body, which were ticked before it (GitHub's `changes.body.from`, read for its checkboxes only and never sent as text) and the sender's permission on the repo (so a tick by someone without write access counts for nothing). On the first run for a repo (the server answers `backfill: true`), or a manual run, it also sends the same for PRs merged in the last `backfill-days` days, at most 200, in batches of 50. Design Bits keeps the number, title, branch, dates, state, the filtered paths, the author's login and who ticked what; it uses the line counts only to judge how costly the change is to undo.

## What is never sent

Code, diffs or patches (they are never requested from GitHub), the PR description's text, comments, and any path matching `.env*`, `secrets/`, `*.pem`, `*.key` or `id_rsa*`, whatever the lists say. Paths are filtered here, in your CI, before anything leaves; the server filters them again as a backstop.

## Authentication

OIDC first. If the job has no `id-token: write`, the Action uses `key` or `DESIGNBITS_KEY`. With neither, it logs a warning and sends nothing.

## Notes

The note sits between `<!-- designbits:needs:start -->` and `<!-- designbits:needs:end -->` in the PR body and is replaced in place. It lists up to 3 approved needs as checkboxes, plus Upkeep and Experiment, with plain counts and a link: never a customer's words. When the change is costly to undo and the need's evidence is thin, it adds one line with an *Ask them* link to the need in Design Bits. A tick by the author stays self-linked; a tick by a reviewer with write access confirms it, and records who ticked it. Only the boxes an edit flips count, so a reviewer who fixes the title or the description confirms nothing; to confirm a box the author ticked (the note marks it *self-linked*), the reviewer unticks it and ticks it again. Ticks on a merged or closed PR change nothing. PRs from the backfill are possible matches only and never count.

Each release is published here from Design Bits' main repository, where the Action is tested on its own and against the real API route, so pull requests here aren't merged. Problems and ideas are welcome as issues.

## License

MIT
