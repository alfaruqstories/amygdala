/**
 * Embedders. Ranking is vector similarity ONLY (brief §6) — no sparse search,
 * no re-ranking. The embedder interface is injectable:
 *   - FakeEmbedder   : deterministic bag-of-token vectors (tests / fake-socket rig)
 *   - Cloudflare's own embeddings (Workers AI) in the adapter plug.
 */
export interface Embedder {
  readonly dims: number;
  embed(text: string): Promise<number[]>;
}

/** FNV-1a 32-bit — stable across runs, no deps. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Porter-lite stemmer: enough that "closes"/"close", "agreed"/"agree", "pharmacies"/"pharmacy" meet. */
export function stem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  for (const suf of ['ing', 'ed', 'es', 's', 'e']) {
    if (word.endsWith(suf) && word.length - suf.length >= 3) return word.slice(0, -suf.length);
  }
  return word;
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'am', 'to', 'of', 'and', 'or', 'in',
  'on', 'for', 'it', 'its', 'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
  'when', 'where', 'how', 'why', 'did', 'does', 'do', 'we', 'you', 'i', 'our', 'their', 'his',
  'her', 'him', 'she', 'he', 'they', 'them', 'at', 'by', 'with', 'as', 'so', 'if', 'but', 'ok',
  'about', 'into', 'over', 'per', 'not', 'no', 'yes', 'also', 'just', 'should', 'would', 'can',
  'will', 'me', 'my', 'your', 'haha', 'lol', 'all', 'ok', 'okay',
]);

/** Tokenise + stem + drop stopwords. Numbers ("2.1m", "13th") are kept whole. */
export function tokenize(text: string): string[] {
  const raw = text.toLowerCase().match(/[a-z0-9]+(?:\.[a-z0-9]+)*/g) ?? [];
  return raw.map(stem).filter((w) => w.length > 0 && !STOPWORDS.has(w) && !STOPWORDS.has(w));
}

export function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

/** Deterministic hash embedding: bag-of-stemmed-tokens, L2-normalised. */
export class FakeEmbedder implements Embedder {
  readonly dims = 512;

  async embed(text: string): Promise<number[]> {
    const vec = new Array<number>(this.dims).fill(0);
    for (const tok of tokenSet(text)) {
      vec[fnv1a(tok) % this.dims] += 1;
    }
    return l2Normalize(vec);
  }
}

export function l2Normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}
