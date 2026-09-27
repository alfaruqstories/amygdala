/**
 * HTTP entry. Routes:
 *   POST /memory/:tenantId/save    -> the tenant's Durable Object
 *   POST /memory/:tenantId/recall  -> the tenant's Durable Object
 *
 * The tenant room is resolved (idFromName) BEFORE any work happens — each
 * request enters its own locked room; there is no shared search anywhere.
 */
import { TenantRoom } from './do';
import type { Env } from './env';

export { TenantRoom };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/memory\/([^/]+)\/(save|recall)$/);
    if (!match) return new Response('not found', { status: 404 });
    const [, tenantId, op] = match;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'invalid JSON body' }, { status: 400 });
    }

    // Pin the tenant id from the route — the room IS the tenant.
    const payload = { ...(body as object), tenantId };

    const id = env.ROOM.idFromName(tenantId);
    const stub = env.ROOM.get(id);
    return stub.fetch(`https://room/${op}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
