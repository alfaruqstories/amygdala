/**
 * Domain types for Amygdala milestone 1.
 *
 * Two doors over a thin store (see the milestone-1 build brief §2):
 *   save(...)   -> SaveReceipt      (immutable evidence + bootstrap read model)
 *   recall(...) -> MemorySnippet[]  (top 5, receipts, chains, vector-only ranking)
 */

/** Caller label: chat id + turn range. Required on every save; repeats are ignored. */
export type CallerLabel = string;

export interface SaveRequest {
  tenantId: string;
  /** Required caller label (chat id + turn range). Repeating a submission is a no-op. */
  submissionId: CallerLabel;
  /** Where the text came from, e.g. "group-chat", "voice-note", "document". */
  source: string;
  /** Raw submitted text. Data, never orders (brief §7). */
  text: string;
  /** Epoch ms the submission occurred. */
  occurredAt: number;
}

export type SaveStatus = 'saved' | 'duplicate';

/** Idempotent receipt (exactly the shape the brief pins): repeating a
 * submission returns the same outcome — same evidence id, nothing re-filed. */
export interface SaveReceipt {
  evidenceId: string;
  status: SaveStatus;
}

export interface RecallRequest {
  tenantId: string;
  query: string;
}

export interface MemorySnippet {
  knowledgeId: string;
  text: string;
  score: number;
  sourceEvidenceIds: string[];
  /** Short provenance chain: max 3 links, every link an existing evidence id. */
  chain: string[];
  lastVerifiedAt: number;
}

// ---------------------------------------------------------------------------
// Rows stored behind the storage boundary. Every row carries an `id`.
// ---------------------------------------------------------------------------

export type RowValue = string | number | boolean | null | string[] | number[];
export interface Row {
  id: string;
  [key: string]: RowValue;
}

/** Logical tables inside a tenant room. Room-scoped: no tenant column is needed by callers. */
export type RowTable = 'evidence' | 'knowledge' | 'label';

/** Evidence log row — append-only, immutable (the rebuild source of last resort). */
export interface EvidenceRow extends Row {
  source: string;
  occurredAt: number;
  createdAt: number;
  /** Blob key holding the raw submitted text. */
  textBlobKey: string;
}

/** Read-model (knowledge) row — the bootstrap read model filed by the save door. */
export interface KnowledgeRow extends Row {
  text: string;
  /** Content fingerprint: normalised text + tenant. */
  fingerprint: string;
  sourceEvidenceIds: string[];
  /** Short provenance chain (max 3 evidence ids). */
  chain: string[];
  lastVerifiedAt: number;
  /** Replacement link: knowledge id that superseded this fact (empty if live). */
  supersededBy: string;
  /** When this fact was superseded (epoch ms; 0 if live). Kept, never served. */
  supersededAt: number;
  /** Open disagreement — kept as an open question, never collapsed. */
  unresolved: boolean;
  createdAt: number;
}

/** Label row — records that a caller label was already processed (no double-saving). */
export interface LabelRow extends Row {
  evidenceId: string;
  status: SaveStatus;
  factIds: string[];
  createdAt: number;
}
