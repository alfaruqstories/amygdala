/**
 * The Cloudflare implementation of the storage boundary — the deploy plug.
 *
 *   store-blob     -> R2, room-prefixed keys (immutable raw evidence)
 *   store-row      -> D1, room-keyed rows (only the owning DO addresses them)
 *   search-vectors -> the tenant's own Durable Object storage slice
 *                     (isolation by construction: no shared index, no filter)
 */
import type { BlobStore, RowStore, StorageBoundary, VectorHit, VectorIndex, VectorPoint } from '../boundary';
import type { Row, RowTable } from '../types';
import { cosine } from '../embedder';
import type { Env } from './env';

class R2BlobStore implements BlobStore {
  constructor(private readonly bucket: R2Bucket, private readonly roomId: string) {}
  async put(key: string, value: Uint8Array): Promise<void> {
    await this.bucket.put(`tenants/${this.roomId}/${key}`, value);
  }
  async get(key: string): Promise<Uint8Array | null> {
    const obj = await this.bucket.get(`tenants/${this.roomId}/${key}`);
    if (!obj) return null;
    return new Uint8Array(await obj.arrayBuffer());
  }
}

class D1RowStore implements RowStore {
  constructor(private readonly db: D1Database, private readonly roomId: string) {}

  async put(table: RowTable, row: Row): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO room_rows (room_id, table_name, id, value, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(room_id, table_name, id) DO UPDATE SET value = excluded.value`,
      )
      .bind(this.roomId, table, row.id, JSON.stringify(row), Date.now())
      .run();
  }

  async get(table: RowTable, id: string): Promise<Row | null> {
    const res = await this.db
      .prepare('SELECT value FROM room_rows WHERE room_id = ?1 AND table_name = ?2 AND id = ?3')
      .bind(this.roomId, table, id)
      .first<{ value: string }>();
    return res ? (JSON.parse(res.value) as Row) : null;
  }

  async list(table: RowTable): Promise<Row[]> {
    const res = await this.db
      .prepare('SELECT id, value FROM room_rows WHERE room_id = ?1 AND table_name = ?2 ORDER BY id')
      .bind(this.roomId, table)
      .all<{ id: string; value: string }>();
    return (res.results ?? []).map((r) => JSON.parse(r.value) as Row);
  }
}

/** The room's own vector slice, held in the Durable Object's storage. */
class DoVectorIndex implements VectorIndex {
  private static readonly PREFIX = 'vec:';

  constructor(private readonly storage: DurableObjectStorage) {}

  async upsert(points: VectorPoint[]): Promise<void> {
    if (points.length === 0) return;
    // Empty vector = tombstone (drop from the slice, e.g. superseded facts).
    const live: Record<string, number[]> = {};
    const tombstones: string[] = [];
    for (const p of points) {
      if (p.vector.length === 0) tombstones.push(`${DoVectorIndex.PREFIX}${p.id}`);
      else live[`${DoVectorIndex.PREFIX}${p.id}`] = p.vector;
    }
    if (Object.keys(live).length > 0) await this.storage.put(live);
    if (tombstones.length > 0) await this.storage.delete(tombstones);
  }

  async search(query: number[], topK: number): Promise<VectorHit[]> {
    const all = await this.storage.list<number[]>({ prefix: DoVectorIndex.PREFIX });
    const hits: VectorHit[] = [];
    for (const [key, vector] of all) {
      hits.push({ id: key.slice(DoVectorIndex.PREFIX.length), score: cosine(query, vector) });
    }
    return hits.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1)).slice(0, topK);
  }
}

/**
 * Open one room's storage. Called from inside the owning TenantRoom DO —
 * the room is resolved BEFORE any search begins (construction check).
 */
export function roomStorage(env: Env, tenantId: string, state: DurableObjectState): StorageBoundary {
  return {
    blobs: new R2BlobStore(env.BUCKET, tenantId),
    rows: new D1RowStore(env.DB, tenantId),
    vectors: new DoVectorIndex(state.storage),
  };
}
