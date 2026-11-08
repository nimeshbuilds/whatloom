import assert from 'node:assert/strict';
import test from 'node:test';
import { founderFromExploration } from '../lib/founder-migration.ts';
import { getFounderReadiness, parseFounderProject } from '../lib/founder.ts';
import { exampleProject } from '../lib/studio.ts';

function legacyFixture() {
  const project = exampleProject('making');
  project.context = 'I know two workshops. Keep the first trial within a single design family.';
  project.notes = 'A historical note that should remain available.';
  project.constraints = ['No new machinery'];
  project.assumptions[0].status = 'challenged';
  project.experiments[0].status = 'complete';
  project.experiments[0].result = 'A historical result entered by the original author.';
  project.evidence = [
    { id: 'legacy-source', title: 'An original source record', url: 'https://example.com/workshop', excerpt: 'The original author’s paraphrase.', kind: 'source', stance: 'context', assumptionId: project.assumptions[0].id, addedAt: '2026-11-07T12:00:00.000Z' },
    { id: 'legacy-observation', title: 'A recorded observation', url: '', excerpt: 'A personal observation, not an external source.', kind: 'observation', stance: 'challenges', addedAt: '2026-11-07T13:00:00.000Z' },
    { id: 'legacy-hypothesis', title: 'An untested thought', url: 'https://example.com/question', excerpt: 'A hypothesis with a link must remain a hypothesis.', kind: 'hypothesis', stance: 'context', addedAt: '2026-11-07T14:00:00.000Z' },
  ];
  return project;
}

test('conversion creates a separate, unselected draft and preserves legacy reasoning and historical records', () => {
  const legacy = legacyFixture();
  const original = structuredClone(legacy);
  const draft = founderFromExploration(legacy);
  assert.deepEqual(legacy, original);
  assert.notEqual(draft.id, legacy.id);
  assert.equal(draft.selectedIdeaId, null);
  assert.equal(draft.approval, null);
  assert.equal(draft.stage, 'discover');
  assert.equal(draft.revision, 0);
  assert.deepEqual(draft.messages, []);
  for (const value of [legacy.id, legacy.vision, legacy.context, legacy.thesis, legacy.notes, legacy.constraints[0], legacy.ecosystem[0], legacy.experiments[0].result, legacy.evidence[1].excerpt, legacy.evidence[2].excerpt]) assert.ok(draft.context.includes(value));
  assert.ok(draft.context.includes('"status": "challenged"'));
  assert.ok(draft.context.includes('"status": "complete"'));
  assert.deepEqual(draft.opportunity.assumptions, legacy.assumptions.map(assumption => assumption.text));
  assert.equal(getFounderReadiness(draft).ready, false);
  assert.deepEqual(parseFounderProject(JSON.parse(JSON.stringify(draft))), draft);
});

test('each old path becomes a fresh candidate with its mechanism, obstacles, first move and links intact', () => {
  const legacy = legacyFixture();
  const original = structuredClone(legacy);
  const first = founderFromExploration(legacy);
  const second = founderFromExploration(legacy);
  assert.equal(first.ideas.length, legacy.paths.length);
  assert.notEqual(first.id, second.id);
  for (let index = 0; index < legacy.paths.length; index += 1) {
    const path = legacy.paths[index], idea = first.ideas[index];
    assert.notEqual(idea.id, path.id);
    assert.notEqual(idea.id, second.ideas[index].id);
    assert.equal(idea.title, path.title);
    for (const value of [path.id, path.subtitle, path.description, path.mechanism, path.opportunity, path.obstacle, path.firstMove, path.horizon, ...path.assumptionIds]) assert.ok(idea.description.includes(value));
  }
  first.ideas[0].description = 'Changed only in the first converted copy';
  first.opportunity.assumptions.push('A new question');
  assert.deepEqual(legacy, original);
  assert.notEqual(first.ideas[0].description, second.ideas[0].description);
  assert.equal(second.opportunity.assumptions.length, legacy.assumptions.length);
});

test('dated external source records retain their original date but never gain agent verification', () => {
  const legacy = legacyFixture();
  const draft = founderFromExploration(legacy);
  assert.equal(draft.research.sources.length, 1);
  const source = draft.research.sources[0];
  assert.notEqual(source.id, legacy.evidence[0].id);
  assert.equal(source.url, legacy.evidence[0].url);
  assert.equal(source.checkedAt, legacy.evidence[0].addedAt);
  assert.equal(source.verified, false);
  assert.ok(source.note.includes('not re-opened or verified'));
  assert.ok(source.note.includes('original addedAt record date'));
  assert.ok(source.note.includes(legacy.evidence[0].excerpt));
  assert.equal(draft.research.researchedAt, null);
  assert.equal(draft.research.summary, '');
  assert.deepEqual(draft.research.competitors, []);
});

test('invalid or ambiguous dates and unsafe URLs remain historical text instead of fabricated source checks', () => {
  for (const change of [
    evidence => { evidence.addedAt = 'yesterday'; },
    evidence => { evidence.addedAt = '2026-11-07'; },
    evidence => { evidence.addedAt = '2026-02-30T10:00:00Z'; },
    evidence => { evidence.url = 'javascript:alert(1)'; },
    evidence => { evidence.url = 'https://user:password@example.com'; },
  ]) {
    const legacy = legacyFixture();
    change(legacy.evidence[0]);
    const original = structuredClone(legacy);
    const draft = founderFromExploration(legacy);
    assert.deepEqual(legacy, original);
    assert.deepEqual(draft.research.sources, []);
    assert.ok(draft.context.includes(legacy.evidence[0].addedAt));
    assert.ok(draft.context.includes(legacy.evidence[0].url));
  }
});

test('an oversized exploration fails explicitly without truncating or changing the original', () => {
  const legacy = legacyFixture();
  legacy.notes = 'A'.repeat(20_001);
  const original = structuredClone(legacy);
  assert.throws(() => founderFromExploration(legacy), /too large.*without losing details/);
  assert.deepEqual(legacy, original);
});
