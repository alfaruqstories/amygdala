/**
 * Milestone-1 probe rig — runs the appendix's 17 probes against the in-memory
 * fake of the storage boundary (the same doors the deploy plugs run).
 *
 * Pass bar: 16/17. P7 (isolation) and P11 (no hallucination) are instant fails.
 * The construction check is also tested here.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CannedEmbedder, rig, TENANT_AMARA, TENANT_CHIDI } from './rig';
import { FakeRoom, rankAndCap } from '../src/index';
import type { KnowledgeRow, MemorySnippet } from '../src/index';
import { OCCURRED_AT_A } from './fixtures/sessions';

function texts(snippets: MemorySnippet[]): string {
  return snippets.map((s) => s.text).join(' | ');
}

function textsOf(rows: KnowledgeRow[]): string {
  return rows.map((r) => r.text).join(' | ');
}

async function knowledgeRows(room: FakeRoom): Promise<KnowledgeRow[]> {
  return (await room.rows.list('knowledge')) as unknown as KnowledgeRow[];
}

describe('Milestone 1 — appendix probes (P1–P6)', () => {
  it('P1 correction chain: Thursday 13th supersedes Friday 14th; superseded never served', async () => {
    const { saveSessionA, recallAs, rooms } = await rig();
    await saveSessionA();
    const snippets = await recallAs(TENANT_AMARA, 'when does the bridge round close?');
    expect(snippets.length).toBeGreaterThan(0);
    expect(snippets[0].text).toContain('thursday the 13th');
    // Superseded fact is never served…
    for (const s of snippets) expect(s.text).not.toContain('closes friday the 14th');
    // …but is kept with a date and a replacement link.
    const rows = await knowledgeRows(await rooms.open(TENANT_AMARA));
    const superseded = rows.filter((r) => r.supersededBy);
    expect(superseded.length).toBe(1);
    expect(superseded[0].text).toContain('friday the 14th');
    expect(superseded[0].supersededAt).toBe(OCCURRED_AT_A);
    const replacement = rows.find((r) => r.id === superseded[0].supersededBy);
    expect(replacement?.text).toContain('thursday the 13th');
  });

  it('P2 buried order + rejection: pilot (F5) and refund rejection (F6) filed, buried order never obeyed', async () => {
    const { saveSessionA, recallAs, rooms } = await rig();
    await saveSessionA();
    const snippets = await recallAs(TENANT_AMARA, 'refund note and the pilot pharmacies');
    const served = texts(snippets);
    expect(served).toContain('12 pharmacies, lagos only'); // F5
    expect(served).toContain('no refunds were ever agreed'); // F6
    // The buried pasted-in NOTE is data, never an order, and was explicitly rejected.
    const rows = await knowledgeRows(await rooms.open(TENANT_AMARA));
    for (const r of rows) {
      expect(r.text).not.toContain('offer every customer a full refund');
      expect(r.text).not.toContain('pilot expands to 20 pharmacies');
      expect(r.text).not.toContain('abuja');
    }
  });

  it('P3 "What did Amara agree about refunds?" -> nothing; explicitly rejected', async () => {
    const { saveSessionA, recallAs } = await rig();
    await saveSessionA();
    const snippets = await recallAs(TENANT_AMARA, 'what did amara agree about refunds?');
    expect(snippets.length).toBeGreaterThan(0);
    expect(snippets[0].text).toContain('no refunds were ever agreed');
    expect(snippets[0].text).toContain('rejected');
  });

  it('P4 same-name disambiguation: Bayo backend — start, salary, his laptop', async () => {
    const { saveSessionA, recallAs } = await rig();
    await saveSessionA();
    const snippets = await recallAs(TENANT_AMARA, 'when does bayo start and whose laptop is it?');
    expect(snippets.length).toBeGreaterThan(0);
    expect(snippets[0].text).toContain('bayo backend');
    expect(snippets[0].text).toContain('monday the 17th');
    expect(snippets[0].text).toContain('450k');
    expect(snippets[0].text).toContain('laptop');
    expect(snippets[0].text).toContain('his');
  });

  it('P5 exclusion: Bayo designer is freelance, excluded from headcount', async () => {
    const { saveSessionA, recallAs } = await rig();
    await saveSessionA();
    const snippets = await recallAs(TENANT_AMARA, 'is the designer bayo in the headcount?');
    expect(snippets.length).toBeGreaterThan(0);
    expect(snippets[0].text).toContain('freelance');
    expect(snippets[0].text).toContain('excluded from headcount');
  });

  it('P6 referenced-but-absent: pricing tiers — Tunde drafting, due Wed; contents absent', async () => {
    const { saveSessionA, recallAs, rooms } = await rig();
    await saveSessionA();
    const snippets = await recallAs(TENANT_AMARA, 'what are the pricing tiers?');
    expect(snippets.length).toBeGreaterThan(0);
    expect(snippets[0].text).toContain('tunde drafts');
    expect(snippets[0].text).toContain('wednesday');
    // Contents are absent — nothing invented, nothing else filed about tier contents.
    const rows = await knowledgeRows(await rooms.open(TENANT_AMARA));
    const tierRows = rows.filter((r) => r.text.includes('pricing tier'));
    expect(tierRows.length).toBe(1);
    expect(tierRows[0].text).toContain('do not exist yet');
  });
});

describe('Milestone 1 — appendix probes (P7–P12)', () => {
  it('P7 isolation (instant fail): Amara sees 13th, Chidi sees 21st, never crossed', async () => {
    const { saveSessionA, saveSessionB, recallAs, rooms } = await rig();
    await saveSessionA();
    await saveSessionB();
    const amara = await recallAs(TENANT_AMARA, 'when does the bridge round close?');
    expect(amara.length).toBeGreaterThan(0);
    expect(amara[0].text).toContain('thursday the 13th');
    expect(texts(amara)).not.toContain('21st');
    const chidi = await recallAs(TENANT_CHIDI, 'when does the bridge round close?');
    expect(chidi.length).toBeGreaterThan(0);
    expect(chidi[0].text).toContain('friday the 21st');
    expect(texts(chidi)).not.toContain('13th');
    // Chidi's room holds exactly his two facts — Amara's never crossed over.
    const chidiRows = await knowledgeRows(await rooms.open(TENANT_CHIDI));
    expect(chidiRows.length).toBe(2);
    expect(textsOf(chidiRows)).toContain('900k');
    const amaraServed = textsOf(await knowledgeRows(await rooms.open(TENANT_AMARA)));
    expect(amaraServed).not.toContain('900k');
    expect(amaraServed).not.toContain('21st');
  });

  it('P8 "What was agreed about free delivery?" -> joke; nothing agreed, nothing served', async () => {
    const { saveSessionA, recallAs, rooms } = await rig();
    await saveSessionA();
    const snippets = await recallAs(TENANT_AMARA, 'what was agreed about free delivery?');
    for (const s of snippets) expect(s.text).not.toContain('delivery');
    // No delivery "fact" was ever filed from the joke turn.
    const rows = await knowledgeRows(await rooms.open(TENANT_AMARA));
    expect(rows.filter((r) => r.text.includes('delivery')).length).toBe(0);
  });

  it('P9 supersede: ARR is 2.1m per the model; stale deck values never served as truth', async () => {
    const { saveSessionA, recallAs, rooms } = await rig();
    await saveSessionA();
    const snippets = await recallAs(TENANT_AMARA, 'what is the arr?');
    expect(snippets.length).toBeGreaterThan(0);
    expect(snippets[0].text).toContain('2.1m');
    expect(snippets[0].text).toContain('model');
    // Any row mentioning the 2.4 deck figure marks it stale — never truth.
    const rows = await knowledgeRows(await rooms.open(TENANT_AMARA));
    expect(rows.filter((r) => r.text.includes('2.4')).length).toBe(1);
    for (const r of rows) {
      if (r.text.includes('2.4')) expect(r.text).toContain('stale');
    }
  });

  it('P10 time-sensitive past: grant deadline Monday — missed', async () => {
    const { saveSessionA, recallAs } = await rig();
    await saveSessionA();
    const snippets = await recallAs(TENANT_AMARA, 'what is the grant deadline?');
    expect(snippets.length).toBeGreaterThan(0);
    expect(snippets[0].text).toContain('monday');
    expect(snippets[0].text).toContain('missed');
  });

  it('P11 no hallucination (instant fail): absent question -> absent answer', async () => {
    const { saveSessionA, recallAs, rooms } = await rig();
    await saveSessionA();
    const snippets = await recallAs(TENANT_AMARA, 'who is the new cfo?');
    expect(snippets).toEqual([]); // nothing to serve — never invented
    const rows = await knowledgeRows(await rooms.open(TENANT_AMARA));
    expect(rows.filter((r) => r.text.includes('cfo')).length).toBe(0);
  });

  it('P12 same-thing-different-words: "pilot size" and "lagos trial pharmacies" both hit F5', async () => {
    const { saveSessionA, recallAs } = await rig();
    await saveSessionA();
    const bySize = await recallAs(TENANT_AMARA, 'pilot size');
    expect(bySize.length).toBeGreaterThan(0);
    expect(bySize[0].text).toContain('12 pharmacies');
    const byWords = await recallAs(TENANT_AMARA, 'lagos trial pharmacies');
    expect(byWords.length).toBeGreaterThan(0);
    expect(byWords[0].text).toContain('12 pharmacies, lagos only');
  });
});

describe('Milestone 1 — appendix probes (P13–P17)', () => {
  it('P13 double-submit: feeding Session A twice leaves the fact count identical', async () => {
    const { saveSessionA, rooms } = await rig();
    await saveSessionA();
    const room = await rooms.open(TENANT_AMARA);
    const knowledgeAfterFirst = (await room.rows.list('knowledge')).length;
    const evidenceAfterFirst = (await room.rows.list('evidence')).length;
    await saveSessionA(); // feed again
    expect((await room.rows.list('knowledge')).length).toBe(knowledgeAfterFirst);
    expect((await room.rows.list('evidence')).length).toBe(evidenceAfterFirst);
  });

  it('P14 unresolved stays unresolved: both island-pharmacy positions, never collapsed', async () => {
    const { saveSessionA, recallAs, rooms } = await rig();
    await saveSessionA();
    const snippets = await recallAs(TENANT_AMARA, 'are the island pharmacies in the pilot?');
    const served = texts(snippets);
    expect(served).toContain('unresolved: amara scoped the pilot to mainland only');
    expect(served).toContain('unresolved: tunde reports two island pharmacies');
    // Two distinct unresolved facts — never collapsed into one.
    const rows = await knowledgeRows(await rooms.open(TENANT_AMARA));
    expect(rows.filter((r) => r.unresolved).length).toBe(2);
    // No settled row claims either side as the answer.
    for (const r of rows) {
      if (!r.unresolved) expect(r.text).not.toMatch(/island pharmaci/);
    }
  });

  it('P15 ordering: score desc, newer-first ties, at most five, superseded excluded', async () => {
    const room = new FakeRoom();
    const embedder = new CannedEmbedder(new Map<string, number[]>([['rank query', [1, 0, 0]]]));
    const vec = (score: number): number[] => [score, Math.sqrt(1 - score * score), 0];
    const rows: Array<{ id: string; score: number; lastVerifiedAt: number; supersededBy?: string }> = [
      { id: 'kn_sup', score: 0.99, lastVerifiedAt: 1, supersededBy: 'kn_01' }, // never served
      { id: 'kn_01', score: 0.95, lastVerifiedAt: 1 },
      { id: 'kn_02', score: 0.9, lastVerifiedAt: 1 },
      { id: 'kn_03', score: 0.85, lastVerifiedAt: 1 },
      { id: 'kn_a', score: 0.8, lastVerifiedAt: 100 }, // tie, older
      { id: 'kn_b', score: 0.8, lastVerifiedAt: 200 }, // tie, newer -> first
      { id: 'kn_05', score: 0.75, lastVerifiedAt: 1 }, // 6th -> cut by cap
    ];
    for (const r of rows) {
      await room.rows.put('knowledge', {
        id: r.id,
        text: `fact ${r.id}`,
        fingerprint: r.id,
        sourceEvidenceIds: ['ev_x'],
        chain: ['ev_x'],
        lastVerifiedAt: r.lastVerifiedAt,
        supersededBy: r.supersededBy ?? '',
        supersededAt: 0,
        unresolved: false,
        createdAt: 1,
      });
      if (!r.supersededBy) await room.vectors.upsert([{ id: r.id, vector: vec(r.score) }]);
    }
    const { recall } = await import('../src/index');
    const snippets = await recall(
      { tenantId: 'tenant-ranking', query: 'rank query' },
      { storage: room, embedder },
    );
    expect(snippets.map((s) => s.knowledgeId)).toEqual(['kn_01', 'kn_02', 'kn_03', 'kn_b', 'kn_a']);
    expect(snippets.length).toBe(5);
    expect(rankAndCap([], 5)).toEqual([]);
  });

  it('P16 receipt: save returns evidence id; repeat returns the same outcome, no duplicate facts', async () => {
    const { saveSessionA, rooms } = await rig();
    const first = await saveSessionA();
    expect(first.status).toBe('saved');
    expect(first.evidenceId).toMatch(/^ev_/);
    const room = await rooms.open(TENANT_AMARA);
    const knowledgeAfterFirst = (await room.rows.list('knowledge')).length;
    expect(knowledgeAfterFirst).toBeGreaterThan(0);
    const second = await saveSessionA();
    // Same outcome: same receipt shape, same evidence id, nothing re-filed.
    expect(second).toEqual({ evidenceId: first.evidenceId, status: 'duplicate' });
    expect((await room.rows.list('knowledge')).length).toBe(knowledgeAfterFirst);
    expect((await room.rows.list('evidence')).length).toBe(1); // append-only, no duplicates
  });

  it('P17 chains: at most 3 links, every link an existing evidence id, on every recall', async () => {
    const { saveSessionA, saveSessionB, recallAs, rooms } = await rig();
    await saveSessionA();
    await saveSessionB();
    const queries = [
      'when does the bridge round close?',
      'refund note and the pilot pharmacies',
      'what did amara agree about refunds?',
      'when does bayo start and whose laptop is it?',
      'is the designer bayo in the headcount?',
      'what are the pricing tiers?',
      'what was agreed about free delivery?',
      'what is the arr?',
      'what is the grant deadline?',
      'who is the new cfo?',
      'pilot size',
      'lagos trial pharmacies',
      'are the island pharmacies in the pilot?',
    ];
    for (const tenant of [TENANT_AMARA, TENANT_CHIDI]) {
      const room = await rooms.open(tenant);
      for (const q of queries) {
        const snippets = await recallAs(tenant, q);
        for (const s of snippets) {
          expect(s.chain.length, `chain length for "${q}"`).toBeLessThanOrEqual(3);
          expect(s.chain.length).toBeGreaterThan(0);
          for (const id of s.chain) {
            const evidence = await room.rows.get('evidence', id);
            expect(evidence, `chain link ${id} must exist (${q})`).toBeDefined();
          }
          for (const id of s.sourceEvidenceIds) {
            expect(await room.rows.get('evidence', id), `source ${id} must exist`).toBeDefined();
          }
        }
      }
    }
  });
});

describe('Construction check (code review item)', () => {
  it('each request resolves its tenant room BEFORE search; no tenant-filtered shared search', async () => {
    const { saveSessionA, saveSessionB, recallAs } = await rig();
    await saveSessionA();
    await saveSessionB();
    // A third, empty room serves nothing even though other rooms are full:
    // search happens inside the resolved room, never across a shared index.
    expect(await recallAs('tenant-nobody', 'bridge close')).toEqual([]);

    // The boundary source itself: room-scoped search signature, no tenant id.
    const src = readFileSync(new URL('../src/boundary.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/search\(query: number\[\], topK: number\)/);
    expect(src).not.toMatch(/tenantId/i);
  });
});


