import assert from 'node:assert/strict';
import test from 'node:test';
import { SCENARIOS, createScenarioProject, getScenario } from '../lib/scenarios.ts';
import { parseImport } from '../lib/studio.ts';

const actions = new Set(['map', 'compare', 'path', 'edit-path', 'assumptions', 'evidence', 'add-evidence', 'proofs', 'notes', 'ecosystem', 'share', 'reframe', 'library', 'import']);
const recordIds = project => [project.id, ...project.paths.map(p => p.id), ...project.assumptions.map(a => a.id), ...project.experiments.map(e => e.id), ...project.evidence.map(e => e.id)];

function assertRelationships(project) {
  const paths = new Map(project.paths.map(path => [path.id, path]));
  const assumptions = new Map(project.assumptions.map(assumption => [assumption.id, assumption]));
  for (const path of project.paths) {
    assert.ok(path.assumptionIds.length > 0);
    assert.equal(new Set(path.assumptionIds).size, path.assumptionIds.length);
    for (const id of path.assumptionIds) assert.ok(assumptions.get(id)?.pathIds.includes(path.id), `Missing reverse assumption link for ${path.title}`);
  }
  for (const assumption of project.assumptions) {
    assert.ok(assumption.pathIds.length > 0);
    assert.equal(new Set(assumption.pathIds).size, assumption.pathIds.length);
    for (const id of assumption.pathIds) assert.ok(paths.get(id)?.assumptionIds.includes(assumption.id), `Missing reverse path link for ${assumption.text}`);
  }
  assert.equal(new Set(project.experiments.map(proof => proof.pathId)).size, 3);
  for (const proof of project.experiments) assert.ok(paths.has(proof.pathId));
}

test('ten scenarios have distinct domains and primary product values, with complete browser actions', () => {
  assert.equal(SCENARIOS.length, 10);
  for (const field of ['id', 'title', 'domain', 'value']) assert.equal(new Set(SCENARIOS.map(s => s[field].toLowerCase())).size, 10, `${field} must be unique`);
  const covered = new Set();
  for (const scenario of SCENARIOS) {
    assert.ok(scenario.summary && scenario.duration && scenario.outcome);
    assert.ok(scenario.steps.length >= 4 && scenario.steps.length <= 5);
    assert.equal(new Set(scenario.steps.map(step => step.id)).size, scenario.steps.length);
    for (const step of scenario.steps) {
      assert.ok(step.title && step.instruction && step.expected && step.actionLabel);
      assert.ok(actions.has(step.action), `Unsupported browser action ${step.action}`);
      covered.add(step.action);
    }
  }
  assert.deepEqual(covered, actions);
});

test('every seed contains three distinct mechanisms and linked, unvalidated work', () => {
  for (const scenario of SCENARIOS) {
    const seed = scenario.seed;
    assert.equal(seed.paths.length, 3);
    assert.equal(new Set(seed.paths.map(path => path.mechanism)).size, 3);
    assert.equal(new Set(seed.paths.map(path => path.color)).size, 3);
    assert.ok(seed.assumptions.length >= 4 && seed.assumptions.length <= 6);
    assert.ok(seed.assumptions.every(a => a.status === 'untested'));
    assert.equal(seed.experiments.length, 3);
    assert.ok(seed.experiments.every(proof => proof.status === 'planned' && proof.result === '' && proof.method && proof.successSignal));
    assert.deepEqual(seed.evidence, []);
    assert.ok(seed.context.includes('Illustrative scenario.'));
    assert.ok(seed.constraints.length > 0 && seed.ecosystem.length > 0);
    assertRelationships(seed);
  }
});

test('each scenario round-trips through the actual project import contract without link repair', () => {
  for (const scenario of SCENARIOS) {
    const project = createScenarioProject(scenario.id);
    assert.equal(project.origin, 'example');
    assert.equal(project.title, scenario.title);
    assert.equal(project.domain, scenario.domain);
    assert.equal(project.createdAt, project.updatedAt);
    assert.ok(!Number.isNaN(Date.parse(project.createdAt)));
    assertRelationships(project);
    assert.deepEqual(parseImport(JSON.parse(JSON.stringify(project))), project);
  }
});

test('every fresh start remaps all record IDs and references without carrying seed IDs forward', () => {
  const allCreatedIds = new Set();
  for (const scenario of SCENARIOS) {
    const seedIds = new Set([...scenario.seed.paths, ...scenario.seed.assumptions, ...scenario.seed.experiments].map(record => record.id));
    for (let start = 0; start < 2; start += 1) {
      const project = createScenarioProject(scenario.id);
      const ids = recordIds(project);
      assert.equal(new Set(ids).size, ids.length);
      for (const id of ids) {
        assert.ok(!seedIds.has(id));
        assert.ok(!allCreatedIds.has(id));
        allCreatedIds.add(id);
      }
      assertRelationships(project);
    }
  }
});

test('editing a started project does not mutate the catalog or another fresh copy', () => {
  for (const scenario of SCENARIOS) {
    const originalSeed = structuredClone(scenario.seed);
    const first = createScenarioProject(scenario.id);
    const second = createScenarioProject(scenario.id);
    const untouchedSecond = structuredClone(second);
    first.notes = 'Changed only in this run';
    first.context = 'A private edit';
    first.constraints.push('A new constraint');
    first.ecosystem[0] = 'A new ecosystem role';
    first.paths[0].mechanism = 'An edited mechanism';
    first.paths[0].assumptionIds.pop();
    first.assumptions[0].status = 'challenged';
    first.assumptions[0].pathIds.pop();
    first.experiments[0].status = 'complete';
    first.experiments[0].result = 'A result added after starting';
    first.evidence.push({ id: 'local-edit', title: 'Practice note', url: '', excerpt: 'Fictional rehearsal only', kind: 'hypothesis', stance: 'context', addedAt: new Date().toISOString() });
    assert.deepEqual(scenario.seed, originalSeed);
    assert.deepEqual(second, untouchedSecond);
  }
});

test('lookup has a defined missing state and the factory rejects unknown scenarios', () => {
  assert.equal(getScenario(SCENARIOS[0].id), SCENARIOS[0]);
  assert.equal(getScenario('missing-scenario'), undefined);
  assert.equal(getScenario('__proto__'), undefined);
  assert.throws(() => createScenarioProject('missing-scenario'), /Unknown scenario/);
});

test('guided reframe and practice evidence instructions preserve the boundary between rehearsal and findings', () => {
  const reframe = getScenario('water-without-sensors').steps.find(step => step.action === 'reframe');
  assert.match(reframe.instruction, /does not generate tailored new solutions/);
  assert.match(reframe.expected, /guided project.*changed condition/);
  const evidence = getScenario('wardrobe-repairs').steps.find(step => step.action === 'add-evidence');
  assert.match(evidence.instruction, /select Hypothesis/);
  assert.match(evidence.practiceText, /hypothesis only/);
  const assumptionPractice = getScenario('commute-without-car').steps.find(step => step.id === 'practice-challenge');
  assert.match(assumptionPractice.instruction, /fictional exercise/);
  assert.match(assumptionPractice.expected, /no evidence or experiment is automatically created/);
  assert.equal(getScenario('music-rehearsal').seed.paths[0].title, 'A bounded rehearsal pass');
});
