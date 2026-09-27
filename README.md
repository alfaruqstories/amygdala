# Amygdala

Memory infrastructure for AI agents. Apps save what happened through one door and recall it through another — per user, with receipts showing where every memory came from.

```ts
save({ tenantId, submissionId, source, text, occurredAt }) // -> { evidenceId, status }
recall({ tenantId, query }) // -> top 5 snippets: text, score, source, confidence, history
```

## Architecture

```
                        ┌─────────────────────────────┐
                        │        FAST LOOP            │
                        │  (every request)            │
chat ──► save ──► evidence log (append-only) ──► facts ──► recall ──► answer + receipts
                        │                                   │
                        │        SLOW LOOP            │  one locked
                        │  (idle batches)             │  room per user
                        │  merge · settle · test      │
                        │  file survivors with        ▼
                        │  receipts                   └──► D1 rows
                        │                                 Vectorize slice
                        ▼                                 R2 blobs
                 snapshots + rollback
```

Raw history is kept word for word and never edited; every fact links back to the exact words it came from, so the read model can always be rebuilt from raw.

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
