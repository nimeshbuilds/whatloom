export type Provider = 'guided' | 'codex' | 'claude';
export type PathColor = 'lime' | 'lavender' | 'peach';
export interface InventionPath {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  mechanism: string;
  opportunity: string;
  obstacle: string;
  firstMove: string;
  horizon: 'Now' | 'Next' | 'Later';
  color: PathColor;
  assumptionIds: string[];
}
export interface Assumption {
  id: string;
  text: string;
  whyItMatters: string;
  status: 'untested' | 'supported' | 'challenged';
  pathIds: string[];
}
export interface Evidence {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  kind: 'source' | 'observation' | 'hypothesis';
  stance: 'supports' | 'challenges' | 'context';
  assumptionId?: string;
  addedAt: string;
}
export interface Experiment {
  id: string;
  title: string;
  method: string;
  successSignal: string;
  result: string;
  status: 'planned' | 'running' | 'complete';
  pathId: string;
}
export interface StudioProject {
  id: string;
  title: string;
  vision: string;
  thesis: string;
  domain: string;
  context: string;
  createdAt: string;
  updatedAt: string;
  paths: InventionPath[];
  assumptions: Assumption[];
  evidence: Evidence[];
  experiments: Experiment[];
  ecosystem: string[];
  notes: string;
  origin: 'example' | Provider;
  constraints: string[];
}
export interface GeneratedExploration {
  title: string;
  thesis: string;
  paths: InventionPath[];
  assumptions: Assumption[];
  ecosystem: string[];
  experiments: Experiment[];
}
