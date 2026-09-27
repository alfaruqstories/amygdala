/**
 * Cloudflare bindings for the deploy plug. This is the only module that names
 * the runtime types; the doors and the storage boundary never see them.
 */
export interface Env {
  /** One Durable Object per tenant — the locked room (brief §4). */
  ROOM: DurableObjectNamespace;
  /** store-row plug. */
  DB: D1Database;
  /** store-blob plug (immutable raw evidence). */
  BUCKET: R2Bucket;
  /** Cloudflare's own embeddings (Workers AI) — not via the gateway. */
  AI: Ai;

  // Extraction gateway (Vercel AI SDK, OpenAI-compatible endpoint).
  MIDTIER_MODEL?: string;
  GATEWAY_BASE_URL?: string;
  // Secret — `wrangler secret put GATEWAY_API_KEY`
  GATEWAY_API_KEY?: string;
}
