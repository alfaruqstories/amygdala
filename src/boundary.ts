/**
 * The storage boundary — the ONLY thing build code talks to.
 *
 * Three services, exactly as the brief §3 pins them:
 *   - store-blob      : opaque immutable blobs (raw evidence text)
 *   - store-row       : typed rows (evidence / knowledge / label tables)
 *   - search-vectors  : nearest-neighbour search over the room's own vector slice
 *
 * THE CONSTRUCTION RULE (brief §4, construction check): a handle is opened for
 * one room (tenant) before the doors ever run. Every method below is
 * room-scoped — `searchVectors` takes a query vector and a top-K and nothing
 * else. There is no tenant argument, no shared index, no filter-bolted-on.
 * A future home means one new plug implementing this interface.
 */
import type { Row, RowTable } from './types';

export interface BlobStore {
  put(key: string, value: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

export interface RowStore {
  /** Upsert a row (id is the primary key within the room + table). */
  put(table: RowTable, row: Row): Promise<void>;
  get(table: RowTable, id: string): Promise<Row | null>;
  list(table: RowTable): Promise<Row[]>;
}

export interface VectorPoint {
  id: string;
  vector: number[];
}

export interface VectorHit {
  id: string;
  score: number;
}

export interface VectorIndex {
  /** Upsert vectors into this room's own slice. No other room can see them. */
  upsert(points: VectorPoint[]): Promise<void>;
  /** Room-scoped nearest-neighbour search. No tenant argument by construction. */
  search(query: number[], topK: number): Promise<VectorHit[]>;
}

/** One room's storage. Resolved per request BEFORE any search begins. */
export interface StorageBoundary {
  readonly blobs: BlobStore;
  readonly rows: RowStore;
  readonly vectors: VectorIndex;
}
