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

## Milestone 1 build notes

Two doors over a three-service storage boundary; every service is a swappable
plug. The in-memory fake of the boundary is what tests run against — the
appendix probes (P1–P17, with P7 room-isolation and P11 no-hallucination as
instant fails) pass 16/17 by design and the fake never leaks into the doors.

```
src/
  boundary.ts          the three-service contract (search is room-scoped by construction)
  doors/{save,recall}  the only two ways in
  extract/             gateway reader (Vercel AI SDK, mid-tier model) + scripted fake
  fake/                in-memory boundary for tests
  cloudflare/          deploy plug: TenantRoom Durable Object, D1 rows, R2 blobs,
                       Workers AI embeddings
```

```bash
npm install
npm run typecheck
npm test        # 17 appendix probes + construction check
npx wrangler deploy   # needs D1/R2/DO bindings (wrangler.jsonc) + GATEWAY_API_KEY secret
```

Construction rule, enforced by a test: `search` has no tenant parameter —
rooms are separate storages, never a filter on a shared index.

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
