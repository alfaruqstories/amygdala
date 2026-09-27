/**
 * The SAVE door (brief §2):
 *   save({tenantId, submissionId, source, text, occurredAt}) -> {evidenceId, status}
 *
 * - Appends an immutable evidence record (row + raw blob).
 * - Extracts facts, fingerprints them (normalised text + tenant), and files them
 *   into the bootstrap read model synchronously (milestone-1 amendment).
 * - Returns an idempotent receipt: repeating a submission returns the same
 *   outcome (caller-label dedupe).
 * - No fact is filed without a source evidence ID. Ever.
 * - Superseded facts are kept with date + replacement link, never served.
 */
import type { StorageBoundary } from '../boundary';
import { blobKeyFor, evidenceIdFor, fingerprint, knowledgeIdFor, normalizeFactText } from '../ids';
import type { Embedder } from '../embedder';
import type { Extractor, ExtractedFact } from '../extract/types';
import { validateExtractedFact } from '../extract/types';
import type {
  EvidenceRow,
  KnowledgeRow,
  LabelRow,
  SaveReceipt,
  SaveRequest,
} from '../types';

export interface SaveDeps {
  storage: StorageBoundary;
  extractor: Extractor;
  embedder: Embedder;
}

export class SaveValidationError extends Error {}

export async function save(request: SaveRequest, deps: SaveDeps): Promise<SaveReceipt> {
  const { tenantId, submissionId, source, text, occurredAt } = request;
  if (!tenantId || typeof tenantId !== 'string') throw new SaveValidationError('tenantId is required');
  if (!submissionId || typeof submissionId !== 'string') {
    // Required caller label (chat id + turn range) — saves without one are rejected.
    throw new SaveValidationError('submissionId (caller label) is required');
  }
  if (!source || typeof source !== 'string') throw new SaveValidationError('source is required');
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new SaveValidationError('text is required');
  }
  if (!Number.isFinite(occurredAt)) throw new SaveValidationError('occurredAt must be an epoch-ms number');

  const { storage } = deps;

  // --- No double-saving: caller-label dedupe. Repeats are ignored, same receipt.
  const existingLabel = await storage.rows.get('label', submissionId);
  if (existingLabel) {
    const label = existingLabel as unknown as LabelRow;
    return {
      evidenceId: label.evidenceId,
      status: 'duplicate',
    };
  }

  // --- Immutable evidence record (append-only; row + raw blob).
  const evidenceId = await evidenceIdFor(tenantId, submissionId, text, occurredAt);
  const evidenceRow: EvidenceRow = {
    id: evidenceId,
    source,
    occurredAt,
    createdAt: Date.now(),
    textBlobKey: blobKeyFor(evidenceId),
  };
  await storage.blobs.put(
    evidenceRow.textBlobKey,
    new TextEncoder().encode(JSON.stringify({ tenantId, submissionId, source, text, occurredAt })),
  );
  await storage.rows.put('evidence', evidenceRow);

  // --- Extract facts (model call; the doors never know which model).
  const { facts } = await deps.extractor.extract(request);

  const filedKnowledgeIds: string[] = [];
  for (const fact of facts) {
    if (!validateExtractedFact(fact)) continue; // unvalidated extractions never filed
    const factId = await fileFact(storage, deps.embedder, tenantId, evidenceId, occurredAt, fact);
    if (factId) filedKnowledgeIds.push(factId);
  }

  // --- Label row lands last: a crash mid-extraction replays safely because
  // fingerprints dedupe and the evidence row is content-addressed.
  const labelRow: LabelRow = {
    id: submissionId,
    evidenceId,
    status: 'saved',
    factIds: filedKnowledgeIds,
    createdAt: Date.now(),
  };
  await storage.rows.put('label', labelRow);

  return { evidenceId, status: 'saved' };
}


/**
 * File one extracted fact into the read model. Returns the knowledge id, or
 * null when the fact was skipped (fingerprint refresh of a live fact, or a
 * re-statement of something already superseded).
 */
async function fileFact(
  storage: StorageBoundary,
  embedder: Embedder,
  tenantId: string,
  evidenceId: string,
  occurredAt: number,
  fact: ExtractedFact,
): Promise<string | null> {
  const fp = await fingerprint(fact.text, tenantId);
  const knowledgeId = knowledgeIdFor(fp);
  const existing = await storage.rows.get('knowledge', knowledgeId);

  if (existing) {
    const row = existing as unknown as KnowledgeRow;
    if (row.supersededBy) return null; // superseded facts stay superseded; never revived
    // Same fingerprint -> refresh the timestamp, never duplicate (brief §5).
    const sources = row.sourceEvidenceIds.includes(evidenceId)
      ? row.sourceEvidenceIds
      : [...row.sourceEvidenceIds, evidenceId];
    const refreshed: KnowledgeRow = {
      ...row,
      sourceEvidenceIds: sources,
      lastVerifiedAt: Math.max(row.lastVerifiedAt, occurredAt),
    };
    await storage.rows.put('knowledge', refreshed);
    return null;
  }

  // --- New knowledge row. Chain: own evidence first, then the superseded
  // fact's chain, deduped, capped at 3 links — all existing evidence ids.
  let chain: string[] = [evidenceId];
  let supersededId: string | null = null;

  if (fact.replacesText) {
    const targetFp = await fingerprint(fact.replacesText, tenantId);
    const targetId = knowledgeIdFor(targetFp);
    const target = await storage.rows.get('knowledge', targetId);
    if (target && !(target as unknown as KnowledgeRow).supersededBy) {
      const targetRow = target as unknown as KnowledgeRow;
      supersededId = targetId;
      chain = dedupe([evidenceId, ...targetRow.chain]).slice(0, 3);
      // Keep the superseded fact with its date and replacement link (brief §6).
      const supersededRow: KnowledgeRow = {
        ...targetRow,
        supersededBy: knowledgeId,
        supersededAt: occurredAt,
      };
      await storage.rows.put('knowledge', supersededRow);
    }
  }

  const knowledge: KnowledgeRow = {
    id: knowledgeId,
    // Readable fact text as extracted; normalisation is for the fingerprint only.
    text: fact.text.trim(),
    fingerprint: fp,
    sourceEvidenceIds: [evidenceId],
    chain,
    lastVerifiedAt: occurredAt,
    supersededBy: '',
    supersededAt: 0,
    unresolved: fact.unresolved === true,
    createdAt: Date.now(),
  };
  await storage.rows.put('knowledge', knowledge);

  // File into the room's own vector slice. No other room can see this.
  await storage.vectors.upsert([
    { id: knowledgeId, vector: await embedder.embed(knowledge.text) },
  ]);

  if (supersededId) {
    // The superseded fact's vector must stop matching recalls: drop it from
    // the slice. The row (with date + replacement link) is kept, never served.
    await storage.vectors.upsert([{ id: supersededId, vector: [] }]);
  }

  return knowledgeId;
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}
