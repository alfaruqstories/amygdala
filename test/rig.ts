/**
 * Probe rig: the in-memory fake of the storage boundary, the scripted
 * fake-socket extractor, and the deterministic fake embedder — the same
 * doors the deploy plugs run.
 */
import {
  Embedder,
  FakeEmbedder,
  FakeRooms,
  ScriptedExtractor,
  recall,
  save,
} from '../src/index';
import {
  LABEL_A,
  LABEL_B,
  OCCURRED_AT_A,
  OCCURRED_AT_B,
  SESSION_A,
  SESSION_B,
  TENANT_AMARA,
  TENANT_CHIDI,
} from './fixtures/sessions';

export async function rig() {
  const rooms = new FakeRooms();
  const extractor = new ScriptedExtractor();
  const embedder = new FakeEmbedder();

  const saveSessionA = async (label: string = LABEL_A) =>
    save(
      { tenantId: TENANT_AMARA, submissionId: label, source: 'group-chat', text: SESSION_A, occurredAt: OCCURRED_AT_A },
      { storage: await rooms.open(TENANT_AMARA), extractor, embedder },
    );

  const saveSessionB = async () =>
    save(
      { tenantId: TENANT_CHIDI, submissionId: LABEL_B, source: 'group-chat', text: SESSION_B, occurredAt: OCCURRED_AT_B },
      { storage: await rooms.open(TENANT_CHIDI), extractor, embedder },
    );

  const recallAs = async (tenantId: string, query: string) =>
    recall({ tenantId, query }, { storage: await rooms.open(tenantId), embedder });

  return { rooms, embedder, saveSessionA, saveSessionB, recallAs };
}

/** Deterministic embedder returning canned vectors (ranking probe). */
export class CannedEmbedder implements Embedder {
  readonly dims = 3;
  constructor(private readonly canned: Map<string, number[]>) {}
  async embed(text: string): Promise<number[]> {
    const hit = this.canned.get(text);
    if (!hit) throw new Error(`CannedEmbedder: no vector for ${JSON.stringify(text)}`);
    return hit;
  }
}

export { TENANT_AMARA, TENANT_CHIDI, LABEL_A, LABEL_B, SESSION_A, SESSION_B };
