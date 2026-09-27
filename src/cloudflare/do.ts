/**
 * TenantRoom — one Durable Object per user (brief §4, locked-room isolation).
 * It owns that user's rows and vector slice; every save and recall travels
 * through it. No shared index, no filter-bolted-on, no test shortcut.
 *
 * Cloudflare's own embeddings (Workers AI) are used here; extraction goes
 * through the gateway via the Vercel AI SDK with the pinned mid-tier reader.
 */
import { GatewayExtractor } from '../extract/gateway';
import type { Embedder } from '../embedder';
import { recall } from '../doors/recall';
import { save } from '../doors/save';
import type { Env } from './env';
import { roomStorage } from './adapter';
import type { RecallRequest, SaveRequest } from '../types';

/** Cloudflare's own embeddings (Workers AI). Cloudflare's own, per the brief §1. */
class WorkersAiEmbedder implements Embedder {
  readonly dims = 768;
  private static readonly MODEL = '@cf/baai/bge-base-en-v1.5';
  constructor(private readonly ai: Ai) {}
  async embed(text: string): Promise<number[]> {
    const res = (await this.ai.run(WorkersAiEmbedder.MODEL, { text })) as { data: number[][] };
    const vec = res.data?.[0];
    if (!vec) throw new Error('embedding failed');
    return vec;
  }
}

export class TenantRoom {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const op = url.pathname.replace(/^\/+/, '');
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ error: 'invalid JSON body' }, { status: 400 });
    }

    const boundary = roomStorage(this.env, this.tenantId(payload), this.state);

    if (op === 'save') {
      const receipt = await save(payload as SaveRequest, {
        storage: boundary,
        extractor: this.extractor(),
        embedder: new WorkersAiEmbedder(this.env.AI),
      });
      return Response.json(receipt);
    }
    if (op === 'recall') {
      const snippets = await recall(payload as RecallRequest, {
        storage: boundary,
        embedder: new WorkersAiEmbedder(this.env.AI),
      });
      return Response.json({ snippets });
    }
    return Response.json({ error: `unknown op ${op}` }, { status: 404 });
  }

  /** The room's own tenant id — taken from the payload; the worker route pins it. */
  private tenantId(payload: unknown): string {
    const t = (payload as { tenantId?: unknown })?.tenantId;
    return typeof t === 'string' ? t : '';
  }

  private extractor(): GatewayExtractor {
    const { GATEWAY_BASE_URL, GATEWAY_API_KEY, MIDTIER_MODEL } = this.env;
    if (!GATEWAY_BASE_URL || !GATEWAY_API_KEY || !MIDTIER_MODEL) {
      throw new Error('gateway not configured (GATEWAY_BASE_URL / GATEWAY_API_KEY / MIDTIER_MODEL)');
    }
    return new GatewayExtractor({ baseUrl: GATEWAY_BASE_URL, apiKey: GATEWAY_API_KEY, model: MIDTIER_MODEL });
  }
}
