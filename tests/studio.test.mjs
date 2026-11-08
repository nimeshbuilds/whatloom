import assert from 'node:assert/strict';
import test from 'node:test';
import { EXAMPLES, exampleProject, futureCard, guidedProject, parseImport, safeUrl, toMarkdown } from '../lib/studio.ts';

function projectWithWork() {
  const project = guidedProject('What if local workshops shared their unused manufacturing capacity?', 'I can work with two local workshops.', 'Making');
  project.constraints = ['Start with existing machines', 'Budget: $500'];
  project.notes = 'Interview a workshop operator before choosing the first material.';
  project.assumptions[0].status = 'challenged';
  project.experiments[0].status = 'complete';
  project.experiments[0].result = 'One handoff took longer than expected.';
  project.evidence.push({
    id: 'source-1', title: 'Workshop observation', url: 'https://example.com/workshop',
    excerpt: 'The operator required a reviewed specification before accepting the job.',
    kind: 'observation', stance: 'challenges', assumptionId: project.assumptions[0].id,
    addedAt: '2026-11-07T12:00:00.000Z',
  });
  return project;
}

test('a portable JSON backup preserves recorded evidence, statuses, experiment results and notes', () => {
  const project = projectWithWork();
  assert.deepEqual(parseImport(JSON.parse(JSON.stringify(project))), project);
  for (const example of EXAMPLES) {
    const project = exampleProject(example.id);
    assert.deepEqual(parseImport(project), project);
  }
});

test('older one-way assumption links are restored without mutating the imported document', () => {
  const project = projectWithWork();
  const added = { id: 'new-assumption', text: 'The operator can take a new order.', whyItMatters: 'Capacity must be available.', status: 'untested', pathIds: [project.paths[0].id, project.paths[0].id] };
  project.assumptions.push(added);
  const firstAssumptionId = project.paths[0].assumptionIds[0];
  project.assumptions.find(a => a.id === firstAssumptionId).pathIds = [];
  const original = structuredClone(project);
  const restored = parseImport(project);
  assert.deepEqual(project, original);
  assert.ok(restored.paths[0].assumptionIds.includes('new-assumption'));
  assert.deepEqual(restored.assumptions.find(a => a.id === 'new-assumption').pathIds, [project.paths[0].id]);
  assert.ok(restored.assumptions.find(a => a.id === firstAssumptionId).pathIds.includes(project.paths[0].id));
});

test('import rejects ambiguous IDs and dangling links instead of silently detaching work', () => {
  for (const breakDocument of [
    p => { p.paths[1].id = p.paths[0].id; },
    p => { p.evidence[0].id = p.assumptions[0].id; },
    p => { p.paths[0].assumptionIds.push('missing'); },
    p => { p.assumptions[0].pathIds.push('missing'); },
    p => { p.evidence[0].assumptionId = 'missing'; },
    p => { p.experiments[0].pathId = 'missing'; },
  ]) {
    const project = projectWithWork();
    breakDocument(project);
    assert.throws(() => parseImport(project));
  }
});

test('Markdown exports retain the reasoning and the relationships behind recorded work', () => {
  const project = projectWithWork();
  const markdown = toMarkdown(project);
  assert.ok(markdown.includes(`Area: ${project.domain}`));
  assert.ok(markdown.includes(project.constraints[0]));
  assert.ok(markdown.includes(`**Horizon:** ${project.paths[0].horizon}`));
  assert.ok(markdown.includes(`[challenged] ${project.assumptions[0].text}`));
  assert.ok(markdown.includes(`Connected assumption: ${project.assumptions[0].text}`));
  assert.ok(markdown.includes(`Connected path: ${project.paths[0].title}`));
  assert.ok(markdown.includes(project.evidence[0].addedAt));
  assert.ok(markdown.includes(project.experiments[0].result));
  assert.ok(markdown.includes(project.notes));
});

test('foreign evidence URLs remain inert unless they are HTTP or HTTPS links', () => {
  for (const url of ['javascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', '//example.com', 'not a URL']) {
    const project = projectWithWork();
    project.evidence[0].url = url;
    const imported = parseImport(project);
    assert.equal(imported.evidence[0].url, url);
    assert.equal(safeUrl(imported.evidence[0].url), undefined);
  }
  assert.equal(safeUrl('https://example.com/research?q=1'), 'https://example.com/research?q=1');
});

test('share-card SVG escapes foreign vision and path text before previewing it as HTML', () => {
  const project = projectWithWork();
  project.vision = 'What if <script>alert(1)</script> & "quoted" ideas existed?';
  project.paths[0].title = '</text><script>alert(2)</script>';
  const svg = futureCard(parseImport(project));
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.ok(svg.includes('&amp;'));
  assert.ok(svg.includes('&quot;quoted&quot;'));
});
