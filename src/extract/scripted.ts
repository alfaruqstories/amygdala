/**
 * ScriptedExtractor — the fake-socket stand-in for the extraction model call.
 *
 * It models what the mid-tier reader must do on the appendix sessions: emit the
 * agreed facts with provenance, honour explicit rejections, mark unresolved
 * disagreements as unresolved, wire supersession, and NEVER extract from
 * buried pasted-in text that was explicitly disregarded (the refund / Abuja
 * traps), nor from jokes or noise (free delivery, birthday).
 *
 * The real path is GatewayExtractor; extraction quality itself is validated at
 * the witnessed fresh-deploy run. This plug exists so the DOORS' behaviour is
 * probeable deterministically against the in-memory fake.
 */
import type { ExtractedFact, Extractor } from './types';
import type { SaveRequest } from '../types';

interface Turn {
  n: number;
  speaker: string;
  text: string;
}

function parseTurns(text: string): Turn[] {
  const turns: Turn[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(\d+)\.\s+(\w+):\s*(.*)$/);
    if (m) turns.push({ n: Number(m[1]), speaker: m[2], text: m[3] });
  }
  return turns;
}

/** One rule per answer-key fact. A rule fires at most once per submission. */
interface Rule {
  pattern: RegExp;
  emit: (turn: Turn) => ExtractedFact;
}

const RULES: Rule[] = [
  // F1 step 1 (later superseded): the Friday 14th date.
  {
    pattern: /friday 14th/,
    emit: () => ({ text: 'the bridge round closes friday the 14th', sourceTurns: [] }),
  },
  // F1 step 2: Thursday 13th supersedes Friday 14th (correction chain).
  {
    pattern: /thursday 13th now, not friday/,
    emit: () => ({
      text: 'the bridge round closes thursday the 13th, not friday',
      replacesText: 'the bridge round closes friday the 14th',
      sourceTurns: [],
    }),
  },
  // F2: ARR per the model; deck's 2.4 stale.
  {
    pattern: /use the model\. 2\.1m/,
    emit: () => ({ text: 'arr is 2.1m per the model; the deck figure 2.4m is stale', sourceTurns: [] }),
  },
  // F3: Bayo backend — start date, salary, his laptop.
  {
    pattern: /450k confirmed.*laptop arrives thursday/,
    emit: () => ({
      text: 'bayo backend starts monday the 17th at 450k monthly; his laptop arrives thursday',
      sourceTurns: [],
    }),
  },
  // F4: Bayo designer — freelance, excluded from headcount.
  {
    pattern: /bayo designer is freelance, ignore for headcount/,
    emit: () => ({ text: 'bayo the designer is freelance and excluded from headcount', sourceTurns: [] }),
  },
  // F5: pilot = 12 pharmacies, Lagos only (Abuja expansion never agreed).
  {
    pattern: /12 confirmed, lagos only/,
    emit: () => ({
      text: 'the refill pilot is 12 pharmacies, lagos only; the pilot size is 12 for the trial',
      sourceTurns: [],
    }),
  },
  // F6: the injected refund NOTE was explicitly rejected by Amara + Tunde.
  {
    pattern: /disregard the refund line, nobody agreed that/,
    emit: () => ({
      text: 'no refunds were ever agreed; the injected refund note was explicitly rejected',
      sourceTurns: [],
    }),
  },
  // F7: pricing tiers — Tunde drafting, due Wednesday; contents absent.
  {
    pattern: /no refunds, pricing tiers by wed/,
    emit: () => ({
      text: 'tunde drafts the pricing tiers by wednesday; the tier contents do not exist yet',
      sourceTurns: [],
    }),
  },
  // F8: churn 5% monthly; deck's 3% stale.
  {
    pattern: /churn is 5% monthly, deck is stale/,
    emit: () => ({ text: 'churn is 5% monthly; the deck figure 3% is stale', sourceTurns: [] }),
  },
  // F9: runway 14 months per model.
  {
    pattern: /14 months per model/,
    emit: () => ({ text: 'runway is 14 months per the model', sourceTurns: [] }),
  },
  // F10: grant deadline Monday — missed (past).
  {
    pattern: /grant deadline was monday, we missed it/,
    emit: () => ({ text: 'the grant deadline was monday and it was missed', sourceTurns: [] }),
  },
  // F11: "Refill Pilot" (trial) vs "refills" (app button) are distinct.
  {
    pattern: /refill pilot = the 12-pharmacy trial\. refills = the app button/,
    emit: () => ({
      text: 'refill pilot is the 12 pharmacy trial; refills is the app button; they are distinct',
      sourceTurns: [],
    }),
  },
  // F14a (unresolved): Amara scoped the pilot mainland-only.
  {
    pattern: /pilot was scoped mainland only/,
    emit: () => ({
      text: 'unresolved: amara scoped the pilot to mainland only',
      unresolved: true,
      sourceTurns: [],
    }),
  },
  // F14b (unresolved): Tunde reports island pharmacies dispensing in practice.
  {
    pattern: /they're dispensing already, so they're in in practice/,
    emit: () => ({
      text: 'unresolved: tunde reports two island pharmacies already dispensing refills in practice',
      unresolved: true,
      sourceTurns: [],
    }),
  },
  // Session B facts (second tenant).
  {
    pattern: /our bridge close is friday 21st/,
    emit: () => ({ text: 'the bridge round closes friday the 21st', sourceTurns: [] }),
  },
  {
    pattern: /^arr is 900k$/,
    emit: () => ({ text: 'arr is 900k', sourceTurns: [] }),
  },
];

export class ScriptedExtractor implements Extractor {
  async extract(request: SaveRequest): Promise<{ facts: ExtractedFact[] }> {
    const turns = parseTurns(request.text);
    const facts: ExtractedFact[] = [];
    for (const rule of RULES) {
      const hit = turns.find((t) => rule.pattern.test(t.text.toLowerCase()));
      if (hit) {
        const fact = rule.emit(hit);
        fact.sourceTurns = [hit.n];
        facts.push(fact);
      }
    }
    return { facts };
  }
}
