/**
 * In-memory fake of the storage boundary (brief §3): same three services,
 * same room-scoped handle. Tests run against this; deploy plugs in the
 * Cloudflare implementation. Nothing here names Cloudflare.
 */
import type {
  BlobStore,
  RowStore,
  StorageBoundary,
  VectorHit,
  VectorIndex,
  VectorPoint,
} from '../boundary';
import type { Row, RowTable } from '../types';
import { cosine } from '../embedder';

export class FakeBlobStore implements BlobStore {
  private blobs = new Map<string, Uint8Array>();
  async put(key: string, value: Uint8Array): Promise<void> {
    this.blobs.set(key, value.slice());
  }
  async get(key: string): Promise<Uint8Array | null> {
    return this.blobs.get(key) ?? null;
  }
  get size(): number {
    return this.blobs.size;
  }
}

export class FakeRowStore implements RowStore {
  private tables = new Map<string, Map<string, Row>>();
  async put(table: string, row: Row): Promise<void> {
    let rows = this.tables.get(table);
    if (!rows) {
      rows = new Map();
      this.tables.set(table, rows);
    }
    rows.set(row.id, { ...row });
  }
  async get(table: string, id: string): Promise<Row | null> {
    return this.tables.get(table)?.get(id) ?? null;
  }
  async list(table: string): Promise<Row[]> {
    const rows = this.tables.get(table);
    if (!rows) return [];
    return [...rows.values()].map((r) => ({ ...r }));
  }
  count(table: string): number {
    return this.tables.get(table)?.size ?? 0;
  }
}

export class FakeVectorIndex implements VectorIndex {
  private points = new Map<string, number[]>();

  async upsert(points: VectorPoint[]): Promise<void> {
    for (const p of points) {
      if (p.vector.length === 0) this.points.delete(p.id);
      else this.points.set(p.id, p.vector.slice());
    }
  }

  async search(query: number[], topK: number): Promise<VectorHit[]> {
    const hits: VectorHit[] = [];
    for (const [id, vector] of this.points) {
      hits.push({ id, score: cosine(query, vector) });
    }
    return hits.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1)).slice(0, topK);
  }

  get size(): number {
    return this.points.size;
  }
}

/** One room's fake storage. A handle opened for tenant A cannot see tenant B —
 * by construction: the data simply lives on a different instance. */
export class FakeRoom implements StorageBoundary {
  readonly blobs = new FakeBlobStore();
  readonly rows = new FakeRowStore();
  readonly vectors = new FakeVectorIndex();
}

/** Room factory: resolve the room BEFORE the doors run (construction check). */
export class FakeRooms {
  private rooms = new Map<string, FakeRoom>();

  async open(tenantId: string): Promise<FakeRoom> {
    let room = this.rooms.get(tenantId);
    if (!room) {
      room = new FakeRoom();
      this.rooms.set(tenantId, room);
    }
    return room;
  }

  /** Test-only introspection: room existence without opening a handle. */
  has(tenantId: string): boolean {
    return this.rooms.has(tenantId);
  }
}
