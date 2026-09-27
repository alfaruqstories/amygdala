/**
 * Extraction — the model-side half of the save door.
 *
 * The extractor is behind an interface so the doors never know which model ran.
 * Two plugs:
 *   - GatewayExtractor : the real path. Vercel AI SDK `generateObject` against
 *     the adopted gateway, mid-tier reader model (brief §1). Cloudflare-free.
 *   - ScriptedExtractor: the fake-socket stand-in used by the in-memory test
 *     rig (test appendix: "tests run against the in-memory fake").
 */
import type { SaveRequest } from '../types';

export interface ExtractedFact {
  /** The fact statement as filed into the read model (normalised on save). */
  text: string;
  /** Normalised text of an earlier fact this one supersedes (correction chains). */
  replacesText?: string;
  /** Open disagreement — kept open, never collapsed into one fact. */
  unresolved?: boolean;
  /** Informational provenance: turn numbers within the submission. */
  sourceTurns?: number[];
}

export interface Extractor {
  extract(request: SaveRequest): Promise<{ facts: ExtractedFact[] }>;
}

/** Safety rails the extractor output must pass — code, not prompts (brief §7). */
export function validateExtractedFact(fact: ExtractedFact): boolean {
  if (typeof fact.text !== 'string') return false;
  const text = fact.text.trim();
  if (text.length === 0 || text.length > 500) return false;
  // Stored text is data, never orders: reject imperative/execution-shaped text.
  if (/^(run|execute|delete|ignore all|system:|assistant:|you must)\b/i.test(text)) return false;
  return true;
}
