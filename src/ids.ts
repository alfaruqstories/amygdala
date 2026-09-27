/**
 * Ids, normalisation and fingerprints.
 * Fingerprints are content-addressed: normalised text + tenant. Same fingerprint
 * refreshes the timestamp, never duplicates (brief §5).
 */

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizeFactText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Content fingerprint of a fact: normalised text + tenant id. */
export async function fingerprint(text: string, tenantId: string): Promise<string> {
  return sha256Hex(`${normalizeFactText(text)}|${tenantId}`);
}

/** Evidence id: content-addressed so a replay of the same submission derives the same id. */
export async function evidenceIdFor(
  tenantId: string,
  submissionId: string,
  text: string,
  occurredAt: number,
): Promise<string> {
  const h = await sha256Hex(`evidence|${tenantId}|${submissionId}|${occurredAt}|${normalizeFactText(text)}`);
  return `ev_${h.slice(0, 16)}`;
}

/** Knowledge id derives from the fingerprint (stable across timestamp refreshes). */
export function knowledgeIdFor(fp: string): string {
  return `kn_${fp.slice(0, 16)}`;
}

export function blobKeyFor(evidenceId: string): string {
  return `evidence/${evidenceId}.json`;
}
