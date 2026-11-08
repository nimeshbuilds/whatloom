import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FOUNDER_STAGES, appendFounderMessage, approveFounderProject, brandLogoSvg,
  brandTokensCss, brandTokensJson, buildHandoffMarkdown, createFounderProject,
  founderPatchSchema, getFounderReadiness, isFounderApproved, parseFounderProject,
  productBriefMarkdown, selectFounderIdea, selectFounderName, updateFounderProject,
} from '../lib/founder.ts';

function readyProject() {
  let project = createFounderProject('A tool lending service', 'A fictional fixture with access to one community room.');
  project = selectFounderIdea(project, project.ideas[0].id);
  project = updateFounderProject(project, {
    opportunity: {
      problem: 'Finding a tool for an occasional task takes effort.', audience: 'Residents doing a small home project.',
      whyNow: 'The fixture organizer can investigate a bounded local pilot.', alternatives: 'Buying, borrowing from a friend, or asking someone to complete the task.',
      differentiator: 'A bounded lending process with a named host.', assumptions: ['A hosted checkout reduces coordination effort.'],
    },
    research: {
      summary: 'Illustrative research summary; no actual web research was run by this test.',
      competitors: [{ id: 'alternative-1', name: 'An illustrative alternative', url: 'https://example.com/alternative', description: 'A fixture comparison.', difference: 'The proposed host takes responsibility for the handoff.', sourceIds: ['source-1'] }],
      sources: [{ id: 'source-1', title: 'Fixture source', url: 'https://example.com/alternative', note: 'A manual source record used only as test data.', checkedAt: '2026-11-08T12:00:00.000Z', verified: false }],
      unknowns: ['Willingness to participate and actual operating costs remain unknown.'], researchedAt: null,
    },
    product: {
      what: 'A small hosted tool lending service.', who: 'A resident with a defined occasional task.', why: 'Make temporary access easier to understand and arrange.',
      journeys: ['A resident finds an item, requests a time, collects it from the host, and records its return.'],
      capabilities: ['See availability and the borrowing terms.', 'Request a checkout and receive confirmation.'],
      success: ['A pilot participant can explain the return process without prompting.'], outOfScope: ['Buying inventory or offering unsupervised tool instruction.'],
    },
    brand: {
      names: [{ id: 'name-1', name: 'Borrowfield', rationale: 'Connects access with a shared local place.' }, { id: 'name-2', name: 'Toolturn', rationale: 'Suggests a bounded borrowing cycle.' }],
      selectedName: '', tagline: 'A useful tool. A clear return.', personality: ['Practical', 'Neighborly'],
      palette: { background: '#F7F6F2', text: '#20251D', primary: '#526A3A', secondary: '#DCD5E7', accent: '#D7EE8A' },
      typography: { heading: 'Georgia', body: 'Arial' }, logoConcept: 'A simple monogram with an open circular gesture.',
    },
  });
  return selectFounderName(project, 'name-1');
}

test('a new project preserves its initial context without inventing research, approval, or conversation', () => {
  const project = createFounderProject('A useful starting idea', 'I can access one workshop.');
  assert.equal(project.version, 1);
  assert.equal(project.context, 'I can access one workshop.');
  assert.equal(project.ideas[0].description, 'A useful starting idea');
  assert.equal(project.selectedIdeaId, null);
  assert.deepEqual(project.messages, []);
  assert.deepEqual(project.research.sources, []);
  assert.equal(project.approval, null);
  assert.equal(project.stage, 'discover');
  assert.equal(getFounderReadiness(project).ready, false);
  assert.equal(new Set(FOUNDER_STAGES.map(stage => stage.id)).size, 6);
  const second = createFounderProject('A useful starting idea');
  assert.notEqual(project.id, second.id);
  assert.notEqual(project.ideas[0].id, second.ideas[0].id);
});

test('restore round-trips conversational and structured work without shared mutable records', () => {
  let project = readyProject();
  project = appendFounderMessage(project, { stage: 'product', role: 'user', content: 'Keep the first pilot local.' });
  project = appendFounderMessage(project, { stage: 'product', role: 'assistant', content: 'Which handoff should the host own?' });
  const restored = parseFounderProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(restored, project);
  restored.product.capabilities.push('Only in the restored copy.');
  restored.messages[0].content = 'A local edit';
  assert.equal(project.product.capabilities.length, 2);
  assert.equal(project.messages[0].content, 'Keep the first pilot local.');
  assert.notEqual(project.messages[0].id, project.messages[1].id);
});

test('schema rejects unsupported versions, unsafe sources, duplicate IDs and dangling references', () => {
  for (const change of [
    p => { p.version = 2; },
    p => { p.research.sources[0].url = 'javascript:alert(1)'; },
    p => { p.research.sources[0].url = 'https://user:password@example.com'; },
    p => { p.research.sources[0].checkedAt = 'yesterday'; },
    p => { p.ideas.push({ ...p.ideas[0] }); },
    p => { p.selectedIdeaId = 'missing'; },
    p => { p.research.competitors[0].sourceIds = ['missing']; },
    p => { p.research.researchedAt = '2026-11-08T12:00:00.000Z'; },
  ]) {
    const project = readyProject();
    change(project);
    assert.throws(() => parseFounderProject(project));
  }
  assert.equal(founderPatchSchema.safeParse({ approval: { revision: 0, approvedAt: new Date().toISOString() } }).success, false);
  assert.equal(founderPatchSchema.safeParse({ revision: 5 }).success, false);
  const project = readyProject();
  assert.equal(founderPatchSchema.safeParse({ product: { ...project.product, techStack: 'An implementation detail' } }).success, false);
});

test('readiness includes a manual research path without relabeling sources as agent verified', () => {
  const project = readyProject();
  assert.deepEqual(getFounderReadiness(project), { ready: true, issues: [] });
  assert.equal(project.research.sources[0].verified, false);
  assert.equal(project.research.researchedAt, null);
  const withoutResearch = updateFounderProject(project, { research: { summary: '', sources: [], competitors: [], unknowns: [], researchedAt: null } });
  assert.ok(getFounderReadiness(withoutResearch).issues.some(issue => issue.stage === 'research'));
  assert.throws(() => approveFounderProject(withoutResearch), /Complete the review/);
  assert.equal(withoutResearch.approval, null);
});

test('explicit idea and name choices must come from their current shortlists', () => {
  const project = readyProject();
  assert.throws(() => selectFounderIdea(project, 'missing'), /Choose an idea/);
  assert.throws(() => selectFounderName(project, 'A name outside the shortlist'), /Choose a name/);
  assert.equal(selectFounderName(project, 'Toolturn').brand.selectedName, 'Toolturn');
  const approved = approveFounderProject(project);
  const refreshed = updateFounderProject(approved, { ideas: [{ id: 'replacement', title: 'A new candidate', description: 'A changed direction.' }] });
  assert.equal(refreshed.selectedIdeaId, null);
  assert.equal(refreshed.approval, null);
  assert.deepEqual(refreshed.product, approved.product);
  assert.ok(getFounderReadiness(refreshed).issues.some(issue => issue.stage === 'discover'));
});

test('two spellings of the same name do not satisfy the distinct shortlist review', () => {
  const project = readyProject();
  const duplicate = updateFounderProject(project, { brand: { ...project.brand, names: [{ id: 'n1', name: 'Borrowfield', rationale: 'First entry.' }, { id: 'n2', name: ' borrowFIELD ', rationale: 'Same name with different casing and whitespace.' }] } });
  assert.ok(getFounderReadiness(duplicate).issues.some(issue => issue.stage === 'brand' && issue.message.includes('distinct name')));
  assert.throws(() => approveFounderProject(duplicate), /distinct name/);
});

test('approval is explicit and material document changes invalidate it while chat and navigation preserve it', () => {
  const project = readyProject();
  assert.equal(isFounderApproved(project), false);
  assert.throws(() => buildHandoffMarkdown(project), /Review and approve/);
  const approved = approveFounderProject(project);
  assert.equal(isFounderApproved(approved), true);
  const navigation = updateFounderProject(approved, { stage: 'build' });
  assert.equal(navigation.revision, approved.revision);
  assert.deepEqual(navigation.approval, approved.approval);
  const chat = appendFounderMessage(navigation, { stage: 'build', role: 'user', content: 'Please explain the handoff.' });
  assert.equal(isFounderApproved(chat), true);
  assert.deepEqual(updateFounderProject(approved, { product: structuredClone(approved.product) }).approval, approved.approval);
  for (const patch of [
    { context: 'A changed creator constraint.' },
    { product: { ...approved.product, what: 'A revised first product.' } },
    { opportunity: { ...approved.opportunity, differentiator: 'A revised hypothesis.' } },
    { research: { ...approved.research, unknowns: ['A new unanswered question.'] } },
    { brand: { ...approved.brand, tagline: 'A different promise.' } },
    { brand: { ...approved.brand, palette: { ...approved.brand.palette, primary: '#223344' } } },
  ]) {
    const edited = updateFounderProject(approved, patch);
    assert.equal(edited.revision, approved.revision + 1);
    assert.equal(edited.approval, null);
    assert.equal(isFounderApproved(edited), false);
    assert.throws(() => buildHandoffMarkdown(edited), /Review and approve/);
  }
  assert.equal(project.approval, null);
  assert.equal(isFounderApproved(approved), true);
});

test('restore discards stale approval while preserving the editable work', () => {
  const approved = approveFounderProject(readyProject());
  const changed = { ...approved, revision: approved.revision + 1 };
  const restored = parseFounderProject(changed);
  assert.equal(restored.approval, null);
  assert.deepEqual(restored.product, approved.product);
  assert.equal(approved.approval.revision, approved.revision);
});

test('product brief exports outcomes and scope without adding an implementation plan', () => {
  const project = readyProject();
  const markdown = productBriefMarkdown(project);
  assert.deepEqual([...markdown.matchAll(/^## (.+)$/gm)].map(match => match[1]), ['What', 'Who', 'Why', 'User journeys', 'Capabilities', 'Success', 'Out of scope']);
  for (const value of [project.product.what, project.product.who, project.product.why, ...project.product.journeys, ...project.product.capabilities, ...project.product.success, ...project.product.outOfScope]) assert.ok(markdown.includes(value));
  assert.ok(!markdown.includes('Technical architecture'));
  assert.ok(!markdown.includes(project.research.summary));
});

test('brand assets preserve palette and typography while escaping hostile SVG text', () => {
  const project = readyProject();
  const maliciousName = 'A & B <script>alert(1)</script>';
  const edited = updateFounderProject(project, { brand: { ...project.brand, names: [{ id: 'n1', name: maliciousName, rationale: 'Escaping fixture.' }, project.brand.names[1]], selectedName: maliciousName, tagline: 'A <use href="bad"> tagline', logoConcept: '</desc><script>bad</script>', typography: { heading: 'Georgia" onload="alert(1)', body: 'Arial' } } });
  for (const variant of ['lockup', 'mark', 'wordmark']) {
    const svg = brandLogoSvg(edited, variant);
    assert.ok(svg.startsWith('<svg'));
    assert.ok(!svg.includes('<script>'));
    assert.ok(!svg.includes('" onload="'));
    assert.ok(svg.includes('&lt;script&gt;'));
    assert.ok(svg.includes(edited.brand.palette.text) || variant === 'mark');
  }
  const tokens = JSON.parse(brandTokensJson(project));
  assert.deepEqual(tokens.palette, project.brand.palette);
  assert.deepEqual(tokens.typography, project.brand.typography);
  assert.ok(brandTokensCss(project).includes('--brand-primary: #526A3A;'));
  assert.throws(() => brandLogoSvg({ ...project, brand: { ...project.brand, palette: { ...project.brand.palette, primary: 'red" onload="alert(1)' } } }));
});

test('approved build handoff carries source provenance, brand, open questions and delegated implementation choices', () => {
  const project = approveFounderProject(readyProject());
  const handoff = buildHandoffMarkdown(project);
  assert.ok(handoff.includes(`Revision: ${project.revision}`));
  assert.ok(handoff.includes(project.approval.approvedAt));
  assert.ok(handoff.includes(project.research.sources[0].url));
  assert.ok(handoff.includes('Manually recorded source; not verified by an agent page retrieval.'));
  assert.ok(handoff.includes(project.research.unknowns[0]));
  assert.ok(handoff.includes(project.brand.logoConcept));
  assert.ok(handoff.includes('implementation choices are delegated to the builder'));
  assert.ok(handoff.includes('does not establish demand, proven novelty, or commercial success'));
  assert.ok(handoff.includes('does not authorize deployment'));
});
