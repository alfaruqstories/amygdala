# Amygdala

AI models forget everything between sessions. Amygdala remembers for them: apps save what happened through one door and recall it through another — per user, with receipts showing where every memory came from.

```ts
save({ tenantId, submissionId, source, text, occurredAt }) // -> { evidenceId, status }
recall({ tenantId, query }) // -> top 5 snippets: text, score, source, confidence, history
```

> Status: early build, pre-1.0. Expect breaking changes until the API stabilises.

## How it works

Two loops. The **fast loop** runs on every request: it files the raw chat away untouched, pulls out the facts, and serves them back with links to the exact words they came from. The **slow loop** runs while idle: it merges duplicates, settles conflicts, tests conclusions against old ones, files only survivors — keeping the receipt so a wrong conclusion is removed without touching raw history.

Four rules hold throughout: raw history is never rewritten · stored text can't give orders · every user gets a structural locked room · no answer beats a made-up one.

## Roadmap

| # | Milestone | State |
|---|---|---|
| 1 | Thin store: two doors, one adapter, per-user isolation | In build |
| 2 | Retrieval: dense + sparse + rerank, measured | Planned |
| 3 | Offline consolidation loop with snapshots + rollback | Planned |
| 4 | Safety gates as code | Planned |
| 5 | Eval harness | Planned |

## Issues

Please raise anything — bugs, ideas, questions — as an issue. No pull requests until the API stabilises.

## License

MIT — see [LICENSE](LICENSE).
