'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, Circle, CircleCheck, Clock3, Compass, Copy, RotateCcw, Search, X } from 'lucide-react';
import { SCENARIOS } from '@/lib/scenarios';
import type { Scenario } from '@/lib/scenarios';
import './scenario-experiences.css';

export type ScenarioSession = { projectId: string; step: number; completed: string[] };

function completedCount(scenario: Scenario, completed: string[]): number {
  const marked = new Set(completed);
  return scenario.steps.filter(step => marked.has(step.id)).length;
}

function scenarioNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

export function ScenarioHomeIntro({ onBrowse, onStart }: {
  onBrowse: () => void;
  onStart: (id: string) => void;
}) {
  const featured = SCENARIOS.filter((scenario, index, values) => values.findIndex(other => other.value === scenario.value) === index).slice(0, 3);

  return <section className="scenario-home" aria-labelledby="scenario-home-title">
    <div className="scenario-home-heading">
      <div>
        <span className="scenario-eyebrow">LEARN BY FOLLOWING A POSSIBILITY</span>
        <h2 id="scenario-home-title">A little guidance. A useful first move.</h2>
        <p>{SCENARIOS.length} guided scenarios to help you compare ideas, challenge an assumption, or plan a real proof.</p>
      </div>
      <button type="button" className="scenario-text-button" onClick={onBrowse}>Explore all {SCENARIOS.length} scenarios<ArrowRight size={15}/></button>
    </div>
    <div className="scenario-featured-grid">
      {featured.map((scenario, index) => <article className={`scenario-featured scenario-tone-${index % 3}`} key={scenario.id}>
        <div className="scenario-featured-top"><span>{scenarioNumber(index)} / {scenario.domain}</span><Compass size={16} strokeWidth={1.5}/></div>
        <span className="scenario-featured-value">{scenario.value}</span>
        <h3>{scenario.title}</h3>
        <p>{scenario.summary}</p>
        <div className="scenario-featured-bottom"><span><Clock3 size={12}/>{scenario.duration}</span><button type="button" onClick={() => onStart(scenario.id)} aria-label={`Start guided scenario: ${scenario.title}`}>Try this scenario<ArrowUpRight size={15}/></button></div>
      </article>)}
    </div>
    <p className="scenario-home-footnote">Built-in practice, using the real studio. No AI connection needed.</p>
  </section>;
}

export function ScenarioGallery({ scenarios, onStart, onResume, sessions }: {
  scenarios: Scenario[];
  onStart: (id: string) => void;
  onResume: (id: string) => void;
  sessions: Record<string, ScenarioSession>;
}) {
  const [query, setQuery] = useState('');
  const [progressFilter, setProgressFilter] = useState('all');
  const visible = scenarios.filter(scenario => {
    const session = sessions[scenario.id]?.projectId ? sessions[scenario.id] : undefined;
    const done = session ? completedCount(scenario, session.completed) : 0;
    const complete = scenario.steps.length > 0 && done === scenario.steps.length;
    if (progressFilter === 'new' && session) return false;
    if (progressFilter === 'active' && (!session || complete)) return false;
    if (progressFilter === 'complete' && !complete) return false;
    return `${scenario.title} ${scenario.domain} ${scenario.value} ${scenario.summary} ${scenario.outcome}`.toLowerCase().includes(query.trim().toLowerCase());
  });

  return <div className="scenario-gallery">
    <header className="scenario-gallery-heading">
      <span className="scenario-eyebrow">GUIDED SCENARIOS / {scenarioNumber(scenarios.length - 1)} WAYS IN</span>
      <h1>Get a feel for<br/><em>what’s possible.</em></h1>
      <p>Work through a concrete example, one useful step at a time. Each scenario creates its own practice exploration, ready for your reasoning.</p>
      <div className="scenario-gallery-note"><Compass size={15}/><span>No AI connection needed. Progress is a checklist you mark yourself.</span></div>
    </header>
    <div className="scenario-gallery-tools">
      <label className="scenario-search"><Search size={17}/><span className="sr-only">Search guided scenarios</span><input aria-label="Search guided scenarios" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a question, skill, or scenario…"/>{query&&<button type="button" onClick={() => setQuery('')} aria-label="Clear scenario search"><X size={15}/></button>}</label>
      <label className="scenario-progress-filter"><span className="sr-only">Filter scenarios by progress</span><select aria-label="Filter scenarios by progress" value={progressFilter} onChange={event => setProgressFilter(event.target.value)}><option value="all">All scenarios</option><option value="new">Not started</option><option value="active">In progress</option><option value="complete">Checklist complete</option></select><ChevronDown size={14}/></label>
    </div>
    <div className="scenario-results-label" aria-live="polite">{visible.length} {visible.length === 1 ? 'scenario' : 'scenarios'}{query || progressFilter !== 'all' ? ' found' : ' to explore'}</div>
    {visible.length ? <div className="scenario-gallery-grid">
      {visible.map(scenario => {
        const index = scenarios.indexOf(scenario);
        const session = sessions[scenario.id]?.projectId ? sessions[scenario.id] : undefined;
        const done = session ? completedCount(scenario, session.completed) : 0;
        const complete = scenario.steps.length > 0 && done === scenario.steps.length;
        return <article className={`scenario-card scenario-tone-${index % 3}`} key={scenario.id}>
          <div className="scenario-card-top"><span>{scenarioNumber(index)} / {scenario.domain}</span>{session&&<span className={`scenario-session-status ${complete ? 'is-complete' : ''}`}>{complete?<CircleCheck size={12}/>:<Circle size={11}/>} {complete?'Checklist complete':'In progress'}</span>}</div>
          <span className="scenario-card-value">{scenario.value}</span>
          <h2>{scenario.title}</h2>
          <p className="scenario-card-summary">{scenario.summary}</p>
          <div className="scenario-card-outcome"><span className="scenario-eyebrow">LEAVE WITH</span><p>{scenario.outcome}</p></div>
          <div className="scenario-card-meta"><span><Clock3 size={13}/>{scenario.duration}</span><span>{scenario.steps.length} guided steps</span></div>
          {session&&<div className="scenario-card-progress"><progress max={Math.max(1, scenario.steps.length)} value={done} aria-label={`${done} of ${scenario.steps.length} steps marked done for ${scenario.title}`}/><span>{done}/{scenario.steps.length} marked done</span></div>}
          <div className="scenario-card-actions">{session?<><button type="button" className="scenario-primary" onClick={() => onResume(scenario.id)}>{complete?'Review practice':'Resume practice'}<ArrowRight size={15}/></button><button type="button" className="scenario-fresh" onClick={() => onStart(scenario.id)} title="Create a new practice copy. Your earlier exploration stays on the workbench."><RotateCcw size={13}/>Start fresh</button></>:<button type="button" className="scenario-primary" onClick={() => onStart(scenario.id)}>Start scenario<ArrowUpRight size={15}/></button>}</div>
        </article>;
      })}
    </div>:<div className="scenario-no-results"><Search size={25} strokeWidth={1.4}/><h2>No matching scenarios.</h2><p>Try a broader question or show all progress states.</p><button type="button" className="scenario-text-button" onClick={() => { setQuery(''); setProgressFilter('all'); }}>Show all scenarios<ArrowRight size={14}/></button></div>}
    <footer className="scenario-gallery-footer">Practice builds familiarity. Your own observations and experiments build evidence.</footer>
  </div>;
}

export function ScenarioGuide({ scenario, step, completed, onStep, onAction, onComplete, onBrowse, onCopy, onHide }: {
  scenario: Scenario;
  step: number;
  completed: string[];
  onStep: (index: number) => void;
  onAction: () => void;
  onComplete: () => void;
  onBrowse: () => void;
  onCopy: (text: string) => void;
  onHide: () => void;
}) {
  const [reviewingScenario, setReviewingScenario] = useState<string | null>(null);
  const currentIndex = Math.min(Math.max(Number.isFinite(step) ? Math.floor(step) : 0, 0), Math.max(0, scenario.steps.length - 1));
  const current = scenario.steps[currentIndex];
  const done = completedCount(scenario, completed);
  const allDone = scenario.steps.length > 0 && done === scenario.steps.length;
  const marked = new Set(completed);
  const showCompletion = allDone && reviewingScenario !== scenario.id;
  function selectStep(index: number) {
    setReviewingScenario(allDone ? scenario.id : null);
    onStep(index);
  }

  return <aside className="scenario-guide" id="scenario-guide" aria-labelledby="scenario-guide-title">
    <div className="scenario-guide-header">
      <div><span className="scenario-eyebrow">GUIDED PRACTICE / {scenario.domain}</span><h2 id="scenario-guide-title">{scenario.title}</h2></div>
      <div className="scenario-guide-controls"><button type="button" onClick={onBrowse}>All scenarios<ArrowUpRight size={12}/></button><button type="button" onClick={onHide} aria-label="Hide scenario guide" title="Hide the guide; your progress is kept"><X size={17}/></button></div>
    </div>
    <div className="scenario-guide-progress"><progress max={Math.max(1, scenario.steps.length)} value={done} aria-label={`${done} of ${scenario.steps.length} practice steps marked done`}/><span>{done}/{scenario.steps.length} marked done by you</span></div>
    {showCompletion ? <div className="scenario-guide-complete" role="status">
      <span className="scenario-complete-symbol"><CircleCheck size={27} strokeWidth={1.4}/></span>
      <div><span className="scenario-eyebrow">CHECKLIST COMPLETE</span><h3>You’ve followed this possibility further.</h3><p>{scenario.outcome}</p><small>You marked each step done. Feasibility and demand still need real evidence.</small></div>
      <div className="scenario-complete-actions"><button type="button" className="scenario-primary" onClick={() => { setReviewingScenario(scenario.id); onStep(0); }}>Review the steps<ArrowRight size={14}/></button><button type="button" className="scenario-text-button" onClick={onHide}>Keep working<ArrowUpRight size={13}/></button></div>
    </div> : current ? <>
      <div className="scenario-guide-body">
        <div className="scenario-current-instruction"><span className="scenario-eyebrow">STEP {scenarioNumber(currentIndex)} OF {scenario.steps.length}{marked.has(current.id)&&<span className="scenario-current-done"><Check size={11}/>MARKED DONE</span>}</span><h3>{current.title}</h3><p>{current.instruction}</p></div>
        <div className="scenario-expected"><span className="scenario-eyebrow">WHAT TO LOOK FOR</span><p>{current.expected}</p><button type="button" className="scenario-action-button" onClick={onAction}>{current.actionLabel}<ArrowUpRight size={14}/></button></div>
      </div>
      {current.practiceText&&<details className="scenario-practice-text"><summary>Need something to try?<ChevronDown size={13}/></summary><div><p>{current.practiceText}</p><button type="button" className="scenario-text-button" onClick={() => onCopy(current.practiceText!)}><Copy size={13}/>Copy practice text</button></div></details>}
      <div className="scenario-guide-footer">
        <details className="scenario-all-steps"><summary>All {scenario.steps.length} steps<ChevronDown size={13}/></summary><ol>{scenario.steps.map((item, index) => <li key={item.id}><button type="button" aria-current={index === currentIndex ? 'step' : undefined} onClick={() => selectStep(index)}>{marked.has(item.id)?<CircleCheck size={15}/>:<span className="scenario-step-number">{index + 1}</span>}<span>{item.title}</span>{index === currentIndex&&<span className="scenario-step-current">CURRENT</span>}</button></li>)}</ol></details>
        <div className="scenario-guide-navigation"><button type="button" className="scenario-step-nav" disabled={currentIndex === 0} onClick={() => selectStep(currentIndex - 1)}><ArrowLeft size={13}/>Back</button><button type="button" className="scenario-step-nav" disabled={currentIndex === scenario.steps.length - 1} onClick={() => selectStep(currentIndex + 1)}>Next<ArrowRight size={13}/></button><button type="button" className="scenario-mark-done" onClick={() => { setReviewingScenario(null); onComplete(); }}><Check size={14}/>{marked.has(current.id)?'Done — continue':'Mark step done'}</button></div>
      </div>
      <p className="scenario-manual-note">You choose when a step is done. This checklist records practice, not validation.</p>
      {allDone&&<button type="button" className="scenario-review-summary" onClick={() => setReviewingScenario(null)}>Back to completion summary<ArrowRight size={12}/></button>}
    </>:<div className="scenario-guide-empty"><p>This scenario has no practice steps yet.</p><button type="button" className="scenario-text-button" onClick={onBrowse}>Find another scenario<ArrowRight size={14}/></button></div>}
  </aside>;
}
