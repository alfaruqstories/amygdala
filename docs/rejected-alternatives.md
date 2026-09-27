# Rejected alternatives — Amygdala milestone 1

Decisions made while building milestone 1, and the alternatives that were
rejected. Each entry names the rejection, not the regret: if the pressure
changes, revisit.

## Locked in the brief (rejected before this build started)

### Adopt Supermemory as the store
**Rejected.** Amygdala owns the boundary (store-blob / store-row /
search-vectors). Supermemory is a pattern to borrow — receipts, source
chains, "show me where this came from" — not a black box to delegate to.
The appendix P7 (room isolation) is an instant-fail probe precisely because
a hosted store cannot be audited for it.

### Gateway embeddings from day one
**Rejected.** Embeddings are Cloudflare's own (Workers AI) behind the
`Embedder` plug. The gateway (mid-tier reader via the Vercel AI SDK) is only
the extraction path. One service boundary, one job each.

### Shared index with a per-tenant filter
**Rejected.** P7 makes any shared-index-with-where-clause an instant fail.
Isolation is by construction: one Durable Object (`TenantRoom`) per user,
holding that user's own rows and vector slice. No query is filtered by a
tenant column because no query ever sees another tenant's slice.

### Flagship reader for extraction
**Rejected.** The brief pins a mid-tier model for reading; the appendix
probes (P11 no-hallucination, P15 no-refunds) are calibrated so a flagship
reader is a cost upgrade, not a correctness upgrade.

## Decisions made during this build (revisit if pressure changes)

### Vectorize (shared) with per-room namespace prefixes for M1
**Rejected for M1.** A managed shared index — even namespaced — reintroduces
exactly the shape P7 forbids, and namespaces do not give per-room physical
isolation or cheap per-room teardown. The M1 search-vectors plug is the
tenant's own Durable Object storage slice (sorted, capped at `topK`).
Revisit at scale: swap `DoVectorIndex` for a per-room Vectorize index behind
the same `VectorIndex` interface — the door code does not change.

### Storing normalised fact text
**Rejected.** Lowercased, punctuation-stripped text is fine for
fingerprinting and embedding but hostile to humans reading a snippet (and to
probe assertions like "2.1m"). Knowledge rows store the fact text as
extracted; normalisation is applied only to derive the fingerprint and the
embedding tokens.

### Dense + sparse hybrid ranking in recall
**Rejected for M1.** The brief pins ranking to vector similarity only
(score → lastVerifiedAt → knowledgeId as tiebreak). No BM25, no reranker,
no recency multiplier. Add a `Ranker` plug when a probe demands it; do not
bolt weights onto the door now.

### Richer save receipt (factIds, per-fact statuses)
**Rejected.** The brief pins the receipt to exactly `{ evidenceId, status }`.
Internal per-fact bookkeeping (which knowledge ids a submission filed) lives
on the caller's label row, which is exactly where replay logic will look.
Returning it also would couple the public contract to internal extraction
outcomes.

### Conflicts and resolution as a first-class state machine (M1)
**Deferred.** M1 keeps supersession minimal: a newer same-subject fact marks
the old one `supersededBy`, the old vector is tombstoned, the row survives
for history. The slow loop (merge/settle) arrives in a later milestone;
nothing in these doors presumes its shape.

### Content-hash-only dedupe (drop caller labels)
**Rejected.** Content fingerprints catch rewordings of the same fact, but
only the caller's `submissionId` label makes a *repeat* of the same
submission a true no-op with an identical receipt (P16). Both layers stay.
