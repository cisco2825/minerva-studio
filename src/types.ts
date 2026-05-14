export type PolicyType = 'RULE_CHAIN' | 'DECISION_TABLE' | 'SCORECARD';
export type PolicyStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type EvaluationStatus = 'SUCCESS' | 'ERROR';
export type TraceLevel = 'MINIMAL' | 'STANDARD' | 'FULL';
export type NodeType = 'START' | 'RULE' | 'BRANCH' | 'SOURCE' | 'WORKFLOW' | 'MODEL' | 'OUTCOME';
export type OnMissing = 'FAIL' | 'PASS' | 'SKIP';
export type DataType = 'NUMBER' | 'TEXT' | 'DATE' | 'BOOLEAN';
export type HitPolicy = 'FIRST' | 'UNIQUE';
export type ModelType = 'DECISION_TABLE' | 'SCORECARD' | 'EXPRESSION';
export type Operator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'bt' | 'in' | 'notIn';

// ── Graph model ───────────────────────────────────────────────────────────────

export interface NodePosition { x: number; y: number; }

export interface PolicyNode {
  id: string;
  type: NodeType;
  name?: string;
  position: NodePosition;
  config?: Record<string, unknown>;
}

export interface PolicyEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
}

// Node configs
export interface GraphRule {
  name: string;
  expression: string;
  cantDecideExpression?: string;
  priority: number;
  onMissing?: OnMissing;
}

export interface RuleNodeConfig {
  rules: GraphRule[];
}

export interface BranchCondition {
  id: string;
  expression: string;
  label?: string;
}

export interface BranchNodeConfig {
  conditions: BranchCondition[];
}

export type ModelEntryType = 'SCORECARD' | 'DECISION_TABLE' | 'EXPRESSION';

export interface ModelEntry {
  name: string;
  type: ModelEntryType;
  policyId?: string;
  version?: string;
  resultKey?: string;
  expression?: string;
  priority: number;
}

export interface ModelNodeConfig {
  models: ModelEntry[];
}

export interface WorkflowNodeConfig {
  policyId: string;
  version?: string;
  resultKey?: string;
}

// ── Decision Table inline definition ─────────────────────────────────────────

export interface DtInputColumn {
  name: string;
  param: string;         // context path e.g. "bureau.credit_score"
  datatype: DataType;
}

export interface DtOutputColumn {
  name: string;
  datatype: DataType;
}

export interface DtCellCondition {
  type: 'ANY' | 'CONDITION';
  operator?: Operator;
  value?: unknown;
  values?: unknown[];
}

export interface DtRow {
  priority: number;
  conditions: DtCellCondition[];
  output: unknown;
}

export interface DecisionTableDefinition {
  name?: string;
  inputs: DtInputColumn[];
  output: DtOutputColumn;
  hitPolicy: HitPolicy;
  rows: DtRow[];
}

// ── Scorecard inline definition ───────────────────────────────────────────────

export interface ScoreBand {
  operator: Operator;
  value?: unknown;
  values?: unknown[];
  points: number;
  label?: string;
}

export interface ScorecardVariableConfig {
  name: string;
  param: string;
  bands: ScoreBand[];
  defaultPoints?: number;
  onMissing?: OnMissing;
}

export interface ScoreThreshold {
  min: number;
  max: number;
  outcome: string;
  label?: string;
}

export interface ScorecardDefinition {
  name?: string;
  variables: ScorecardVariableConfig[];
  thresholds?: ScoreThreshold[];
  defaultOutcome?: string;
}

// ── Model node config ─────────────────────────────────────────────────────────

export interface ModelEntry {
  name: string;
  type: ModelType;
  resultKey?: string;
  expression?: string;
  inlineDefinition?: DecisionTableDefinition | ScorecardDefinition;
  priority: number;
}

export interface ModelNodeConfig {
  models: ModelEntry[];
}

export interface OutcomeNodeConfig {
  outcome: string;
  outputFields?: Record<string, unknown>;
}

// ── Policy storage ────────────────────────────────────────────────────────────

export interface PolicySummary {
  id: string;
  policyId: string;
  version: string;
  name: string;
  type: PolicyType;
  status: PolicyStatus;
  description?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  versionCount: number;
}

export interface PolicyStats {
  total: number;
  active: number;
  draft: number;
  inactive: number;
  archived: number;
}

export interface Policy {
  id: string;
  name: string;
  version: string;
  type: PolicyType;
  nodes?: PolicyNode[];
  edges?: PolicyEdge[];
}

export interface SavePolicyRequest {
  description?: string;
  createdBy?: string;
  policy: {
    id: string;
    version: string;
    name: string;
    type: 'RULE_CHAIN';
    nodes: PolicyNode[];
    edges: PolicyEdge[];
  };
}

// ── Evaluation ────────────────────────────────────────────────────────────────

export interface EvaluationLogSummary {
  id: string;
  policyId: string;
  policyVersion: string;
  policyDefId: string;
  status: EvaluationStatus;
  outcome?: string;
  errorMessage?: string;
  traceLevel: TraceLevel;
  durationMs: number;
  evaluatedBy?: string;
  evaluatedAt: string;
}

export interface EvaluationLogDetail extends EvaluationLogSummary {
  context: string;
  result: string;
}

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface RuleResult {
  name: string;
  result: boolean;
  action: string;
  outcome?: string;
}

export interface ScorecardBreakdownEntry {
  variable: string;
  matchedBand?: string;
  points?: number;
}

export interface EvaluationResult {
  policyId: string;
  policyVersion: string;
  policyType: PolicyType;
  outcome?: string;
  triggeredBy?: string;
  ruleResults?: RuleResult[];
  skippedRules?: string[];
  notEvaluated?: string[];
  outputFields?: Record<string, unknown>;
  // scorecard fields
  totalScore?: number;
  maxPossibleScore?: number;
  label?: string;
  breakdown?: ScorecardBreakdownEntry[];
  // decision table fields
  tableOutput?: unknown;
  outputColumn?: string;
  evaluationMs: number;
}
