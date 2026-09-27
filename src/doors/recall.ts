/**
 * The RECALL door (brief §2):
 *   recall({tenantId, query}) -> MemorySnippet[]
 *
 * - The room is resolved (by whoever opens the StorageBoundary) BEFORE the
 *   search begins — construction check satisfied: searchVectors on this handle
 *   physically cannot see another room's slice.
 * - Vector similarity ONLY: score desc, then lastVerifiedAt desc, then
 *   knowledgeId asc. At most five results. Newer wins ties.
 * - Superseded facts are kept but never served.
 * - Every snippet carries its receipts (source evidence ids) and a short chain
 *   (max 3 links, each an existing evidence id).
 */
import type { StorageBoundary } from '../boundary';
import { cosine } from '../embedder';
import type { Embedder } from '../embedder';
import type { KnowledgeRow, MemorySnippet, RecallRequest } from '../types';

export interface RecallDeps {
  storage: StorageBoundary;
  embedder: Embedder;
}

export class RecallValidationError extends Error {}

/**
 * Minimum cosine similarity to count as a hit. Encoded in code, outside
 * model-editable scope (brief §7). Below this, the door answers "absent" —
 * it never pads with weak matches (no-hallucination rule).
 */
export const RECALL_MIN_SCORE = 0.15;

export const RECALL_MAX_RESULTS = 5;

export async function recall(request: RecallRequest, deps: RecallDeps): Promise<MemorySnippet[]> {
  const { tenantId, query } = request;
  if (!tenantId || typeof tenantId !== 'string') {
    throw new RecallValidationError('tenantId is required');
  }
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new RecallValidationError('query is required');
  }

  const { storage, embedder } = deps;

  // Search the room's own slice. No tenant argument exists on this handle.
  const queryVector = await embedder.embed(query);
  const hits = await storage.vectors.search(queryVector, 64);

  const snippets: MemorySnippet[] = [];
  for (const hit of hits) {
    if (hit.score < RECALL_MIN_SCORE) continue;
    const row = await storage.rows.get('knowledge', hit.id);
    if (!row) continue;
    const knowledge = row as unknown as KnowledgeRow;
    if (knowledge.supersededBy) continue; // superseded: kept with date + link, never served
    if (!knowledge.sourceEvidenceIds.length) continue; // no fact without a source evidence id
    snippets.push({
      knowledgeId: knowledge.id,
      text: knowledge.text,
      score: hit.score,
      sourceEvidenceIds: [...knowledge.sourceEvidenceIds],
      chain: [...knowledge.chain],
      lastVerifiedAt: knowledge.lastVerifiedAt,
    });
  }

  return rankAndCap(snippets, RECALL_MAX_RESULTS);
}

/** Vector-only ranking: score desc -> lastVerifiedAt desc -> knowledgeId asc; at most `cap`. */
export function rankAndCap(snippets: MemorySnippet[], cap: number): MemorySnippet[] {
  return [...snippets]
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.lastVerifiedAt - a.lastVerifiedAt ||
        (a.knowledgeId < b.knowledgeId ? -1 : a.knowledgeId > b.knowledgeId ? 1 : 0),
    )
    .slice(0, cap);
}

export { cosine };
