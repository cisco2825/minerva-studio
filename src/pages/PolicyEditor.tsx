import { useCallback, useRef, useState, useEffect, useMemo, createContext, useContext } from 'react';
import { useNavigate, useLocation, useBlocker } from 'react-router-dom';
import ReactFlow, {
  Background, BackgroundVariant, Controls, MiniMap,
  addEdge, applyEdgeChanges, applyNodeChanges,
  Handle, Position, ReactFlowProvider, useReactFlow, useViewport,
  type Node, type Edge, type Connection,
  type NodeChange, type EdgeChange, type NodeProps,
  MarkerType, Panel,
} from 'reactflow';
// @ts-ignore — dagre has no bundled types but @types/dagre is installed
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import {
  Button, Input, Select, Drawer, Modal, Typography, Space, Tag, Tooltip,
  message, Popover,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, PlayCircleOutlined,
  CheckCircleOutlined, CloseCircleOutlined, QuestionCircleOutlined,
  ApartmentOutlined, ThunderboltOutlined, ThunderboltFilled, ForkOutlined,
  DatabaseOutlined, ApiOutlined, SaveOutlined,
  CalculatorOutlined, TableOutlined, FunctionOutlined,
  EllipsisOutlined, ExpandOutlined, CaretRightOutlined, SearchOutlined,
  DownloadOutlined, ReadOutlined,
} from '@ant-design/icons';
import { createPolicy, updateDraftPolicy, fetchAllLookups, fetchAllPolicies, fetchPolicyDefinition, fetchVersions, validateExpressions, fetchLookupColumns } from '../api/client';
import type { LookupSummary, PolicySummary, ExpressionEntry, ExpressionValidationError } from '../types';
import ExpressionReference, { NODE_TYPE_TO_SECTION } from '../components/ExpressionReference';
import type {
  PolicyNode, PolicyEdge, SavePolicyRequest,
  RuleNodeConfig, BranchNodeConfig, WorkflowNodeConfig,
  OutcomeNodeConfig, CustomOutputNodeConfig, GraphRule, BranchCondition,
  ModelNodeConfig, ModelEntry, ModelType,
} from '../types';

const { Text } = Typography;

// ── Edit panel context ────────────────────────────────────────────────────────

interface EditRequest {
  nodeId: string;
  nodeType: string;
  label: string;
  config: Record<string, unknown>;
}

interface EditPanelContextType {
  openEdit: (req: EditRequest) => void;
}
const EditPanelContext = createContext<EditPanelContextType | null>(null);

// ── Model editor context ──────────────────────────────────────────────────────

interface ModelEditorContextType {
  openModelEditor: (nodeId: string, modelIndex: number, model: ModelEntry) => void;
}
const ModelEditorContext = createContext<ModelEditorContextType | null>(null);

// ── Lookup metadata context ────────────────────────────────────────────────────
// Provides lookupId → column names mapping to all ExpressionInput instances
// without prop-drilling. Populated once by PolicyEditorContent.
interface LookupMetaCtx {
  meta: Record<string, string[]>;
  /** Lazily fetches columns from the BE if the lookup has no stored metadata yet. */
  fetchColumns: (lookupId: string) => Promise<string[]>;
}
const LookupMetaContext = createContext<LookupMetaCtx>({
  meta: {},
  fetchColumns: async () => [],
});

// ── Palette config ────────────────────────────────────────────────────────────

const PALETTE_BLOCKS = [
  { type: 'RULE',     label: 'Rule',      icon: <ThunderboltOutlined />, color: '#4f46e5', bg: '#eef2ff' },
  { type: 'BRANCH',   label: 'Branch',    icon: <ForkOutlined />,        color: '#d97706', bg: '#fffbeb' },
  { type: 'SOURCE',   label: 'Source',    icon: <DatabaseOutlined />,    color: '#dc2626', bg: '#fef2f2' },
  { type: 'WORKFLOW', label: 'Workflow',  icon: <ApiOutlined />,         color: '#2563eb', bg: '#eff6ff' },
  { type: 'MODEL',    label: 'Model Set', icon: <CalculatorOutlined />,  color: '#ea580c', bg: '#fff7ed' },
];
const PALETTE_OUTCOMES = [
  { type: 'OUTCOME',       label: 'Approved',       outcome: 'APPROVED',    color: '#16a34a', bg: '#f0fdf4', icon: <CheckCircleOutlined /> },
  { type: 'OUTCOME',       label: 'Rejected',       outcome: 'REJECTED',    color: '#dc2626', bg: '#fef2f2', icon: <CloseCircleOutlined /> },
  { type: 'OUTCOME',       label: "Can't Decide",   outcome: 'CANT_DECIDE', color: '#d97706', bg: '#fffbeb', icon: <QuestionCircleOutlined /> },
  { type: 'CUSTOM_OUTPUT', label: 'Custom Output',  outcome: '',            color: '#0891b2', bg: '#ecfeff', icon: <FunctionOutlined /> },
];

// ── Edge helpers ──────────────────────────────────────────────────────────────

const HANDLE_COLOR: Record<string, string> = {
  pass:       '#16a34a',
  fail:       '#ef4444',
  cantDecide: '#f59e0b',
  next:       '#6366f1',
  default:    '#94a3b8',
};
function edgeProps(sourceHandle: string | null | undefined) {
  const color = HANDLE_COLOR[sourceHandle || 'next'] ?? '#94a3b8';
  return { stroke: color, strokeWidth: 2, markerEnd: { type: MarkerType.ArrowClosed, color } };
}

// ── Node visual config ────────────────────────────────────────────────────────

const NODE_THEME: Record<string, { accent: string; accentLight: string; icon: React.ReactNode }> = {
  START:         { accent: '#4f46e5', accentLight: '#eef2ff', icon: <PlayCircleOutlined /> },
  RULE:          { accent: '#4f46e5', accentLight: '#eef2ff', icon: <ThunderboltOutlined /> },
  BRANCH:        { accent: '#d97706', accentLight: '#fffbeb', icon: <ForkOutlined /> },
  SOURCE:        { accent: '#dc2626', accentLight: '#fef2f2', icon: <DatabaseOutlined /> },
  WORKFLOW:      { accent: '#2563eb', accentLight: '#eff6ff', icon: <ApiOutlined /> },
  MODEL:         { accent: '#ea580c', accentLight: '#fff7ed', icon: <CalculatorOutlined /> },
  OUTCOME:       { accent: '#16a34a', accentLight: '#f0fdf4', icon: <CheckCircleOutlined /> },
  CUSTOM_OUTPUT: { accent: '#0891b2', accentLight: '#ecfeff', icon: <FunctionOutlined /> },
};

// ── Shared handle styles ──────────────────────────────────────────────────────

const inputHandle: React.CSSProperties = {
  background: '#fff',
  width: 10, height: 10,
  border: '2px solid #d1d5db',
  boxShadow: '0 0 0 3px rgba(0,0,0,0.04)',
  left: -6,
};

function outputHandle(color: string): React.CSSProperties {
  return {
    background: '#fff',
    width: 10, height: 10,
    border: `2px solid ${color}`,
    boxShadow: `0 0 0 3px ${color}18`,
    position: 'relative',
    right: -16,
    top: 'auto',
    transform: 'none',
  };
}

// ── Auto-layout (dagre) ───────────────────────────────────────────────────────

/** Estimate node height based on its content so dagre can space things correctly. */
function estimateNodeHeight(node: Node): number {
  const type = node.type || '';
  const cfg = (node.data?.config || {}) as Record<string, unknown>;

  if (type === 'RULE') {
    const rules = (cfg.rules as unknown[]) || [];
    // header(46) + description(30) + rule rows (capped 4, ~52px each with expression) + overflow(24) + addRule(34) + 3 output handle rows(30ea) + inputs footer(26)
    const ruleRows = rules.length === 0 ? 52 : Math.min(rules.length, 4) * 52;
    const overflow = rules.length > 4 ? 24 : 0;
    return 46 + 30 + ruleRows + overflow + 34 + 30 * 3 + 26;
  }
  if (type === 'BRANCH') {
    const conds = (cfg.conditions as unknown[]) || [];
    // header(46) + description(30) + condition rows (~58px each) + default row(40) + addCondition(34) + inputs footer(26)
    return 46 + 30 + (conds.length || 1) * 58 + 40 + 34 + 26;
  }
  if (type === 'MODEL') {
    const models = (cfg.models as unknown[]) || [];
    // header(46) + description(30) + model rows (~50px each, capped 3) + addModel(34) + next handle(30) + inputs footer(26)
    return 46 + 30 + Math.min(models.length || 1, 3) * 50 + (models.length > 3 ? 24 : 0) + 34 + 30 + 26;
  }
  if (type === 'SOURCE') {
    const srcs = (cfg.sources as unknown[]) || [];
    // header(46) + label(28) + source pills (~42px each) + addSource(36) + next handle(30) + inputs footer(26)
    return 46 + 28 + Math.max(srcs.length, 1) * 42 + 36 + 30 + 26;
  }
  if (type === 'WORKFLOW') return 46 + 30 + 50 + 34 + 30 * 3 + 26;
  if (type === 'START' || type === 'OUTCOME') return 52;
  if (type === 'CUSTOM_OUTPUT') return 80;
  return 220;
}

const NODE_LAYOUT_WIDTH: Record<string, number> = {
  START: 180, RULE: 350, BRANCH: 350,
  SOURCE: 330, MODEL: 330, WORKFLOW: 330, OUTCOME: 180, CUSTOM_OUTPUT: 220,
};

function getAutoLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));

  // network-simplex (default) is designed to minimise edge crossings.
  // Larger ranksep / nodesep give edges room to breathe without overlapping nodes.
  g.setGraph({
    rankdir: 'LR',
    ranksep: 160,
    nodesep: 110,
    marginx: 60,
    marginy: 60,
  });

  nodes.forEach(n => {
    const w = NODE_LAYOUT_WIDTH[n.type || ''] ?? 300;
    const h = estimateNodeHeight(n);
    g.setNode(n.id, { width: w, height: h });
  });

  // Deduplicate exact source→target pairs; give higher weight to non-outcome
  // edges so the main pipeline stays compact while outcome arms can extend.
  const seen = new Set<string>();
  edges.forEach(e => {
    const key = `${e.source}→${e.target}`;
    if (!seen.has(key)) {
      const isOutcomeEdge = nodes.find(n => n.id === e.target)?.type === 'OUTCOME';
      g.setEdge(e.source, e.target, { weight: isOutcomeEdge ? 1 : 2, minlen: 1 });
      seen.add(key);
    }
  });

  dagre.layout(g);

  return nodes.map(n => {
    const pos = g.node(n.id);
    if (!pos) return n;
    const w = NODE_LAYOUT_WIDTH[n.type || ''] ?? 300;
    const h = estimateNodeHeight(n);
    return { ...n, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });
}

// ── Compact-mode hook + shared compact card ───────────────────────────────────

const COMPACT_ZOOM = 0.58;

function useCompact() {
  const { zoom } = useViewport();
  return zoom < COMPACT_ZOOM;
}

/**
 * Compact representation shown when the canvas is zoomed out.
 * Renders icon + label with all the same Handle IDs so edges stay connected.
 */
function CompactNodeCard({ nodeType, label, inputHandleId, sourceHandleIds }: {
  nodeType: string;
  label: string;
  inputHandleId?: string;
  sourceHandleIds: string[];
}) {
  const theme = NODE_THEME[nodeType] || NODE_THEME.RULE;
  const count = sourceHandleIds.length;
  return (
    <div style={{
      background: '#fff',
      border: `1.5px solid ${theme.accent}45`,
      borderRadius: 10,
      padding: '7px 14px 7px 10px',
      display: 'flex', alignItems: 'center', gap: 8,
      minWidth: 160, maxWidth: 240,
      boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
      position: 'relative',
      transition: 'all 0.15s',
      fontFamily: "'Inter', sans-serif",
    }}>
      {inputHandleId && (
        <Handle type="target" position={Position.Left} id={inputHandleId} style={inputHandle} />
      )}
      <div style={{
        width: 26, height: 26, borderRadius: 6, flexShrink: 0,
        background: theme.accentLight,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: theme.accent, fontSize: 13,
      }}>
        {theme.icon}
      </div>
      <span style={{
        fontWeight: 600, fontSize: 12, color: '#1e293b',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
        letterSpacing: '-0.015em',
      }}>
        {label}
      </span>
      {/* Stack all source handles at right, evenly spaced */}
      {sourceHandleIds.map((hid, i) => (
        <Handle key={hid} type="source" position={Position.Right} id={hid}
          style={{
            background: '#fff', width: 9, height: 9,
            border: `2px solid ${theme.accent}`,
            position: 'absolute', right: -6,
            top: count === 1 ? '50%' : `${10 + (i / (count - 1)) * 80}%`,
            transform: 'translateY(-50%)',
          }} />
      ))}
    </div>
  );
}

// ── Node action button style ──────────────────────────────────────────────────

const nodeActionBtn: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 5,
  border: '1px solid #e5e7eb',
  background: '#fafafa',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', color: '#9ca3af', fontSize: 11, padding: 0,
};

// ── NodeCard ──────────────────────────────────────────────────────────────────

function NodeCard({
  nodeType, label, children, onEdit, outputHandles, hasInput = true,
}: {
  nodeType: string; label: string; children?: React.ReactNode; onEdit?: () => void;
  outputHandles?: { id: string; label: string; color: string }[]; hasInput?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const theme = NODE_THEME[nodeType] || NODE_THEME.RULE;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        background: '#fff',
        border: `1px solid ${hover ? theme.accent + '55' : '#e5e7eb'}`,
        borderRadius: 10,
        minWidth: 300, maxWidth: 380,
        boxShadow: hover
          ? '0 8px 28px rgba(0,0,0,0.11), 0 2px 8px rgba(0,0,0,0.06)'
          : '0 1px 4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        fontSize: 12,
        fontFamily: "'Inter', -apple-system, sans-serif",
        overflow: 'visible',
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
    >
      {hasInput && <Handle type="target" position={Position.Left} id="input" style={inputHandle} />}

      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{
        padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid #f3f4f6',
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
          background: theme.accentLight,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: theme.accent, fontSize: 13,
        }}>
          {theme.icon}
        </div>
        <span style={{
          flex: 1, fontWeight: 600, fontSize: 13, color: '#111827',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          letterSpacing: '-0.02em',
        }}>
          {label}
        </span>
        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 3, flexShrink: 0, opacity: hover ? 1 : 0, transition: 'opacity 0.15s' }}>
          <button style={nodeActionBtn} title="Expand"><ExpandOutlined /></button>
          <button style={nodeActionBtn} title="Run"><CaretRightOutlined /></button>
          <button style={nodeActionBtn} title="Configure" onClick={onEdit}><EllipsisOutlined /></button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      {children}

      {/* ── Output handles — vertically centred column on right edge ── */}
      {outputHandles && outputHandles.length > 0 && (
        <div style={{
          position: 'absolute',
          right: -6,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}>
          {outputHandles.map((h) => (
            <Tooltip key={h.id} title={h.label} placement="right" mouseEnterDelay={0}>
              <Handle
                type="source" position={Position.Right} id={h.id}
                style={{
                  position: 'relative',
                  top: 'auto', right: 'auto', transform: 'none',
                  background: '#fff',
                  width: 10, height: 10,
                  border: `2px solid ${h.color}`,
                  boxShadow: `0 0 0 3px ${h.color}22`,
                }}
              />
            </Tooltip>
          ))}
        </div>
      )}

      {/* ── Inputs footer ───────────────────────────────────── */}
      <div style={{ padding: '5px 12px', borderTop: '1px solid #f3f4f6' }}>
        <span style={{ fontSize: 10, color: '#d1d5db', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Inputs</span>
      </div>

    </div>
  );
}

// ── START node ────────────────────────────────────────────────────────────────

function StartNode(_: NodeProps) {
  const compact = useCompact();
  if (compact) return <CompactNodeCard nodeType="START" label="START" sourceHandleIds={['next']} />;
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e0e7ff',
      borderRadius: 10,
      padding: '10px 20px',
      minWidth: 120,
      boxShadow: '0 1px 4px rgba(79,70,229,0.08)',
      display: 'flex', alignItems: 'center', gap: 8,
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 6,
        background: '#eef2ff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#4f46e5', fontSize: 13, flexShrink: 0,
      }}>
        <PlayCircleOutlined />
      </div>
      <span style={{ fontWeight: 700, fontSize: 13, color: '#4f46e5', letterSpacing: '-0.01em' }}>START</span>
      <Handle type="source" position={Position.Right} id="next"
        style={{ background: '#fff', width: 10, height: 10, border: '2px solid #4f46e5', boxShadow: '0 0 0 3px #eef2ff', right: -6 }} />
    </div>
  );
}

// ── RULE node ─────────────────────────────────────────────────────────────────

function RuleNode({ id, data }: NodeProps) {
  const cfg: RuleNodeConfig = data.config || { rules: [] };
  const rules: GraphRule[] = cfg.rules || [];
  const editCtx = useContext(EditPanelContext);
  const openEdit = () => editCtx?.openEdit({ nodeId: id, nodeType: 'RULE', label: data.label, config: data.config || {} });
  const compact = useCompact();
  if (compact) return (
    <CompactNodeCard nodeType="RULE" label={data.label || 'Rule Node'}
      inputHandleId="input"
      sourceHandleIds={['pass', 'fail', 'cantDecide']} />
  );
  return (
    <NodeCard
      nodeType="RULE" label={data.label || 'Rule Node'}
      onEdit={openEdit}
      outputHandles={[
        { id: 'pass',       label: 'Pass',        color: '#16a34a' },
        { id: 'fail',       label: 'Fail',         color: '#ef4444' },
        { id: 'cantDecide', label: "Can't Decide", color: '#f59e0b' },
      ]}
    >
      {/* Description placeholder */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid #f3f4f6' }}>
        <span style={{ color: '#d1d5db', fontSize: 12 }}>Add description</span>
      </div>

      {/* Rule rows */}
      <div>
        {rules.length === 0 ? (
          <div style={{ padding: '12px', color: '#9ca3af', fontSize: 11, textAlign: 'center' }}>
            No rules — click ··· to configure
          </div>
        ) : (
          rules.map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start',
              padding: '7px 12px 7px 6px',
              borderBottom: i < rules.length - 1 ? '1px solid #f9fafb' : undefined,
            }}>
              {/* Drag handle */}
              <span style={{ color: '#d1d5db', fontSize: 13, cursor: 'grab', padding: '1px 4px 0', flexShrink: 0, lineHeight: 1.3, letterSpacing: -2 }}>⠿</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 10, background: '#e0e7ff',
                    borderRadius: 4, padding: '0px 5px', flexShrink: 0,
                    fontWeight: 600, color: '#6366f1', lineHeight: '18px',
                  }}>{i + 1}</span>
                  <span style={{ fontWeight: 600, fontSize: 12, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
                    {r.name}
                  </span>
                </div>
                {r.expression && (
                  <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 3, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
                    {r.expression}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Rule */}
      <div style={{ padding: '6px 12px 8px', borderTop: '1px solid #f3f4f6' }}>
        <button onClick={openEdit} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#6366f1', fontSize: 12, fontWeight: 500, padding: 0,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <PlusOutlined style={{ fontSize: 10 }} /> Add Rule
        </button>
      </div>
    </NodeCard>
  );
}

// ── BRANCH node ───────────────────────────────────────────────────────────────

function BranchNode({ id, data }: NodeProps) {
  const cfg: BranchNodeConfig = data.config || { conditions: [] };
  const conditions: BranchCondition[] = cfg.conditions || [];
  const editCtx = useContext(EditPanelContext);
  const openEdit = () => editCtx?.openEdit({ nodeId: id, nodeType: 'BRANCH', label: data.label, config: data.config || {} });
  const theme = NODE_THEME.BRANCH;
  const compact = useCompact();
  if (compact) return (
    <CompactNodeCard nodeType="BRANCH" label={data.label || 'Branch'}
      inputHandleId="input"
      sourceHandleIds={[...conditions.map(c => c.id), 'default']} />
  );
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        minWidth: 300, maxWidth: 380,
        boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
        fontSize: 12, overflow: 'visible',
      }}
    >
      <Handle type="target" position={Position.Left} id="input" style={inputHandle} />

      {/* Header */}
      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ width: 26, height: 26, borderRadius: 6, background: theme.accentLight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.accent, fontSize: 13, flexShrink: 0 }}>
          <ForkOutlined />
        </div>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: '#111827' }}>{data.label || 'Branch'}</span>
        <div style={{ display: 'flex', gap: 3 }}>
          <button style={nodeActionBtn} title="Expand"><ExpandOutlined /></button>
          <button style={nodeActionBtn} title="Run"><CaretRightOutlined /></button>
          <button style={nodeActionBtn} title="Configure" onClick={openEdit}><EllipsisOutlined /></button>
        </div>
      </div>

      {/* Description */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid #f3f4f6' }}>
        <span style={{ color: '#d1d5db', fontSize: 12 }}>Add description</span>
      </div>

      {/* Condition rows — each with its own inline handle */}
      <div>
        {conditions.length === 0 ? (
          <div style={{ padding: '12px', color: '#9ca3af', fontSize: 11, textAlign: 'center' }}>
            No conditions — click ··· to configure
          </div>
        ) : (
          conditions.map((c) => (
            <div key={c.id} style={{
              padding: '7px 0 7px 12px',
              borderBottom: '1px solid #f9fafb',
              display: 'flex', alignItems: 'flex-start',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 8 }}>
                  <span style={{ fontSize: 10, color: '#d97706', fontWeight: 700, background: '#fef3c7', borderRadius: 4, padding: '1px 6px', letterSpacing: '0.02em' }}>IF</span>
                  <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500, letterSpacing: '-0.01em' }}>{c.label || c.id}</span>
                </div>
                {c.expression && (
                  <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 10.5, color: '#64748b', marginTop: 4, letterSpacing: '-0.01em', lineHeight: 1.5 }}>
                    {c.expression}
                  </div>
                )}
              </div>
              <Handle type="source" position={Position.Right} id={c.id} style={outputHandle(theme.accent)} />
            </div>
          ))
        )}

        {/* Else / Default row */}
        <div style={{ padding: '7px 0 7px 12px', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 8 }}>
            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, background: '#f1f5f9', borderRadius: 4, padding: '1px 6px', letterSpacing: '0.02em' }}>ELSE</span>
            <span style={{ fontSize: 11, color: '#94a3b8', letterSpacing: '-0.01em' }}>default</span>
          </div>
          <Handle type="source" position={Position.Right} id="default" style={outputHandle('#94a3b8')} />
        </div>
      </div>

      {/* Add Condition */}
      <div style={{ padding: '6px 12px 8px', borderTop: '1px solid #f3f4f6' }}>
        <button onClick={openEdit} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: theme.accent, fontSize: 12, fontWeight: 500, padding: 0,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <PlusOutlined style={{ fontSize: 10 }} /> Add Condition
        </button>
      </div>

      {/* Inputs footer */}
      <div style={{ padding: '5px 12px', borderTop: '1px solid #f3f4f6' }}>
        <span style={{ fontSize: 11, color: '#d1d5db', fontWeight: 500 }}>Inputs</span>
      </div>
    </div>
  );
}

// ── Source selector ───────────────────────────────────────────────────────────

export interface SourceItem {
  type: string;   // 'lookup' | 'finboxSource' | 'customSource' | …
  id: string;     // the identifier within that type
  label: string;  // human-readable display name
}

// Registry of categories — add a new entry here when a source type is introduced
const SOURCE_CATEGORIES: Array<{ key: string; label: string; color: string }> = [
  { key: 'lookup',       label: 'Lookup',        color: '#4f46e5' },
  { key: 'finboxSource', label: 'Finbox Source',  color: '#0284c7' },
  { key: 'customSource', label: 'Custom Source',  color: '#16a34a' },
];

/** Shared popover body — used by both SourceSelector (drawer) and SourceNode (canvas). */
function SourcePickerContent({ value, onChange }: {
  value: SourceItem[];
  onChange: (items: SourceItem[]) => void;
}) {
  const [activeCategory, setActive]  = useState('lookup');
  const [search, setSearch]          = useState('');
  const [lookups, setLookups]        = useState<LookupSummary[]>([]);
  const [loading, setLoading]        = useState(false);

  useEffect(() => {
    if (lookups.length > 0) return;
    setLoading(true);
    fetchAllLookups().then(setLookups).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const categoryItems: Record<string, SourceItem[]> = {
    lookup:       lookups.map(l => ({ type: 'lookup', id: l.lookupId, label: l.name })),
    finboxSource: [],
    customSource: [],
  };

  const filtered = (categoryItems[activeCategory] ?? []).filter(item =>
    item.label.toLowerCase().includes(search.toLowerCase()) ||
    item.id.toLowerCase().includes(search.toLowerCase())
  );

  const isSelected = (item: SourceItem) =>
    value.some(v => v.type === item.type && v.id === item.id);

  const toggle = (item: SourceItem) => {
    isSelected(item)
      ? onChange(value.filter(v => !(v.type === item.type && v.id === item.id)))
      : onChange([...value, item]);
  };

  return (
    <div style={{ width: 290 }}>
      {/* Search */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#9ca3af', fontSize: 12 }} />}
          placeholder="Search..."
          size="small"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ borderRadius: 6 }}
          autoFocus
        />
      </div>

      {/* Categories */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Categories
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SOURCE_CATEGORIES.map(cat => {
            const hasItems = (categoryItems[cat.key] ?? []).length > 0;
            const isActive = activeCategory === cat.key;
            return (
              <button key={cat.key}
                onClick={() => { if (hasItems) setActive(cat.key); }}
                style={{
                  padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                  cursor: hasItems ? 'pointer' : 'default',
                  border: isActive ? `1.5px solid ${cat.color}` : '1.5px solid #e5e7eb',
                  background: isActive ? `${cat.color}12` : '#fff',
                  color: isActive ? cat.color : hasItems ? '#374151' : '#d1d5db',
                  transition: 'all 0.15s',
                }}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Items list */}
      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '16px 12px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '16px 12px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
            {(categoryItems[activeCategory] ?? []).length === 0 ? 'No sources available' : 'No results'}
          </div>
        ) : (
          filtered.map(item => {
            const sel = isSelected(item);
            return (
              <div key={`${item.type}:${item.id}`}
                onClick={() => toggle(item)}
                style={{
                  padding: '9px 14px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: sel ? '#f0fdf4' : 'transparent',
                  borderLeft: sel ? '3px solid #16a34a' : '3px solid transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLDivElement).style.background = '#f9fafb'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = sel ? '#f0fdf4' : 'transparent'; }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{item.id}</div>
                </div>
                {sel && <CheckCircleOutlined style={{ color: '#16a34a', fontSize: 14, flexShrink: 0 }} />}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Edit-panel version: shows selected as tags + an "Add Source" button */
function SourceSelector({ value, onChange }: {
  value: SourceItem[];
  onChange: (items: SourceItem[]) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {value.map(item => (
            <Tag key={`${item.type}:${item.id}`} closable
              onClose={() => onChange(value.filter(v => !(v.type === item.type && v.id === item.id)))}
              style={{ margin: 0, borderRadius: 6, fontSize: 12 }}
              color="blue"
            >
              <span style={{ fontSize: 10, opacity: 0.65, marginRight: 3 }}>{item.type}</span>{item.label}
            </Tag>
          ))}
        </div>
      )}
      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger="click"
        placement="bottomLeft"
        arrow={false}
        content={<SourcePickerContent value={value} onChange={onChange} />}
        overlayInnerStyle={{ padding: 0, borderRadius: 10, overflow: 'hidden' }}
      >
        <Button size="small" icon={<PlusOutlined />} block type="dashed">
          Add Source
        </Button>
      </Popover>
    </div>
  );
}

// ── SOURCE node ───────────────────────────────────────────────────────────────

function SourceNode({ id, data }: NodeProps) {
  // Normalise: policy JSON may store sources as plain strings; the UI stores SourceItem objects.
  const rawSources: (SourceItem | string)[] = (data.config as { sources?: (SourceItem | string)[] })?.sources || [];
  const sources: SourceItem[] = rawSources.map(s =>
    typeof s === 'string' ? { type: 'lookup', id: s, label: s } : s
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const editCtx = useContext(EditPanelContext);
  const openEdit = () => editCtx?.openEdit({ nodeId: id, nodeType: 'SOURCE', label: data.label, config: data.config || {} });
  const compact = useCompact();
  if (compact) return (
    <CompactNodeCard nodeType="SOURCE" label={data.label || 'Source'}
      inputHandleId="input"
      sourceHandleIds={['next']} />
  );

  const updateSources = (next: SourceItem[]) => {
    data.onConfigChange?.(id, { ...(data.config as object || {}), sources: next });
  };

  const removeSource = (item: SourceItem, e: React.MouseEvent) => {
    e.stopPropagation();
    updateSources(sources.filter(s => !(s.type === item.type && s.id === item.id)));
  };

  return (
    <NodeCard
      nodeType="SOURCE" label={data.label || 'Source'}
      outputHandles={[{ id: 'next', label: 'Next', color: '#dc2626' }]}
      onEdit={openEdit}
    >
      {/* Label */}
      <div style={{ padding: '6px 14px 4px' }}>
        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Data Sources</span>
      </div>

      {/* Source rows */}
      <div style={{ padding: '4px 14px 6px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sources.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Name pill */}
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 10px',
              background: '#fafafa', fontSize: 12, fontWeight: 500, color: '#0f172a',
              letterSpacing: '-0.01em',
            }}>
              <span>{s.label}</span>
              <CaretRightOutlined style={{ color: '#9ca3af', fontSize: 11, transform: 'rotate(90deg)' }} />
            </div>
            {/* Delete */}
            <button
              onClick={(e) => removeSource(s, e)}
              style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                border: '1px solid #e5e7eb', background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#9ca3af', fontSize: 13,
              }}
            >
              <DeleteOutlined />
            </button>
          </div>
        ))}
      </div>

      {/* Add Source */}
      <div style={{ padding: '2px 14px 12px' }}>
        <Popover
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          trigger="click"
          placement="bottom"
          arrow={false}
          content={
            <SourcePickerContent
              value={sources}
              onChange={next => { updateSources(next); }}
            />
          }
          overlayInnerStyle={{ padding: 0, borderRadius: 10, overflow: 'hidden' }}
        >
          <button
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#374151', fontSize: 13, fontWeight: 500, padding: 0,
              display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <PlusOutlined style={{ fontSize: 12 }} /> Add Source
          </button>
        </Popover>
      </div>
    </NodeCard>
  );
}

// ── WORKFLOW node ─────────────────────────────────────────────────────────────

function WorkflowNode({ id, data }: NodeProps) {
  const cfg: WorkflowNodeConfig = (data.config as WorkflowNodeConfig) || {};
  const outcomes: string[] = data.workflowOutcomes || ['APPROVED', 'REJECTED'];
  const editCtx = useContext(EditPanelContext);
  const openEdit = () => editCtx?.openEdit({ nodeId: id, nodeType: 'WORKFLOW', label: data.label, config: data.config || {}, workflowOutcomes: data.workflowOutcomes } as EditRequest & { workflowOutcomes?: string[] });
  const compact = useCompact();
  if (compact) return (
    <CompactNodeCard nodeType="WORKFLOW" label={data.label || 'Workflow'}
      inputHandleId="input"
      sourceHandleIds={[...outcomes, 'default']} />
  );
  return (
    <NodeCard
      nodeType="WORKFLOW" label={data.label || 'Workflow'}
      onEdit={openEdit}
      outputHandles={[
        ...outcomes.map(o => ({ id: o, label: o, color: '#2563eb' })),
        { id: 'default', label: 'Default', color: '#94a3b8' },
      ]}
    >
      {/* Description */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid #f3f4f6' }}>
        <span style={{ color: '#d1d5db', fontSize: 12 }}>Add description</span>
      </div>

      {/* Policy ref */}
      <div style={{ padding: '8px 12px' }}>
        {cfg.policyId ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ApiOutlined style={{ color: '#2563eb', fontSize: 13 }} />
            <span style={{ fontWeight: 600, fontSize: 12, color: '#1e40af' }}>{cfg.policyId}</span>
            {cfg.version && (
              <span style={{ fontSize: 10, color: '#fff', background: '#2563eb', borderRadius: 4, padding: '1px 6px' }}>v{cfg.version}</span>
            )}
          </div>
        ) : (
          <div style={{ color: '#9ca3af', fontSize: 11 }}>No policy selected — click ···</div>
        )}
      </div>

      {/* Add */}
      <div style={{ padding: '6px 12px 8px', borderTop: '1px solid #f3f4f6' }}>
        <button onClick={openEdit} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#2563eb', fontSize: 12, fontWeight: 500, padding: 0,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <PlusOutlined style={{ fontSize: 10 }} /> Configure
        </button>
      </div>
    </NodeCard>
  );
}

// ── MODEL node ────────────────────────────────────────────────────────────────

const MODEL_TYPE_META: Record<ModelType, { icon: React.ReactNode; color: string; bg: string }> = {
  SCORECARD:      { icon: <CalculatorOutlined />, color: '#7c3aed', bg: '#f5f3ff' },
  DECISION_TABLE: { icon: <TableOutlined />,      color: '#2563eb', bg: '#eff6ff' },
  EXPRESSION:     { icon: <FunctionOutlined />,   color: '#16a34a', bg: '#f0fdf4' },
};

function ModelNode({ id, data }: NodeProps) {
  const cfg: ModelNodeConfig = data.config || { models: [] };
  const models: ModelEntry[] = cfg.models || [];
  const editCtx = useContext(EditPanelContext);
  const modelEditorCtx = useContext(ModelEditorContext);
  const openEdit = () => editCtx?.openEdit({ nodeId: id, nodeType: 'MODEL', label: data.label, config: data.config || {} });
  const compact = useCompact();
  if (compact) return (
    <CompactNodeCard nodeType="MODEL" label={data.label || 'Model Set'}
      inputHandleId="input"
      sourceHandleIds={['next']} />
  );
  return (
    <NodeCard
      nodeType="MODEL" label={data.label || 'Model Set'}
      onEdit={openEdit}
      outputHandles={[{ id: 'next', label: 'Next', color: '#ea580c' }]}
    >
      {/* Description */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid #f3f4f6' }}>
        <span style={{ color: '#d1d5db', fontSize: 12 }}>Add description</span>
      </div>

      {/* Model rows */}
      <div>
        {models.length === 0 ? (
          <div style={{ padding: '12px', color: '#9ca3af', fontSize: 11, textAlign: 'center' }}>
            No models — click ··· to configure
          </div>
        ) : (
          models.map((m, i) => {
            const meta = MODEL_TYPE_META[m.type as ModelType] || MODEL_TYPE_META.EXPRESSION;
            const hasDefinition = m.type === 'EXPRESSION' ? !!m.expression : !!m.inlineDefinition;
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px 7px 12px',
                borderBottom: i < models.length - 1 ? '1px solid #f9fafb' : undefined,
              }}>
                <span style={{ color: '#d1d5db', fontSize: 13, letterSpacing: -2, flexShrink: 0 }}>⠿</span>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: meta.color, fontSize: 12, flexShrink: 0 }}>
                  {meta.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>{m.name}</div>
                  <div style={{ fontSize: 10, color: meta.color, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', marginTop: 1 }}>{m.type.replace('_', ' ')}</div>
                </div>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: hasDefinition ? '#22c55e' : '#e5e7eb', flexShrink: 0 }} />
                {(m.type === 'DECISION_TABLE' || m.type === 'SCORECARD') && (
                  <button
                    onClick={e => { e.stopPropagation(); modelEditorCtx?.openModelEditor(id, i, m); }}
                    style={{ background: 'none', border: `1px solid ${meta.color}40`, borderRadius: 4, cursor: 'pointer', color: meta.color, fontSize: 10, fontWeight: 600, padding: '2px 7px' }}
                  >
                    Open ↗
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add Model */}
      <div style={{ padding: '6px 12px 8px', borderTop: '1px solid #f3f4f6' }}>
        <button onClick={openEdit} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#ea580c', fontSize: 12, fontWeight: 500, padding: 0,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <PlusOutlined style={{ fontSize: 10 }} /> Add Model
        </button>
      </div>
    </NodeCard>
  );
}

// ── OUTCOME node ──────────────────────────────────────────────────────────────

const OUTCOME_META: Record<string, { accent: string; accentLight: string; icon: React.ReactNode }> = {
  APPROVED:    { accent: '#16a34a', accentLight: '#f0fdf4', icon: <CheckCircleOutlined /> },
  REJECTED:    { accent: '#dc2626', accentLight: '#fef2f2', icon: <CloseCircleOutlined /> },
  CANT_DECIDE: { accent: '#d97706', accentLight: '#fffbeb', icon: <QuestionCircleOutlined /> },
};

function OutcomeNode({ id, data }: NodeProps) {
  const cfg: OutcomeNodeConfig = (data.config as OutcomeNodeConfig) || { outcome: '' };
  const m = OUTCOME_META[(cfg.outcome || '').toUpperCase()] || { accent: '#6b7280', accentLight: '#f9fafb', icon: <ApartmentOutlined /> };
  const editCtx = useContext(EditPanelContext);
  const openEdit = () => editCtx?.openEdit({ nodeId: id, nodeType: 'OUTCOME', label: data.label, config: data.config || {} });
  const label = cfg.outcome || data.label || 'Outcome';
  const compact = useCompact();
  // OutcomeNode compact: reuse its own compact styling (it's already a pill)
  if (compact) return (
    <div style={{
      background: '#fff', border: `1.5px solid ${m.accent}45`, borderRadius: 10,
      padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 7,
      minWidth: 120, boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
    }}>
      <Handle type="target" position={Position.Left} id="input"
        style={{ background: '#fff', width: 8, height: 8, border: `2px solid ${m.accent}`, left: -5 }} />
      <div style={{ width: 22, height: 22, borderRadius: 5, flexShrink: 0, background: m.accentLight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: m.accent, fontSize: 12 }}>{m.icon}</div>
      <span style={{ fontWeight: 600, fontSize: 12, color: m.accent }}>{label}</span>
    </div>
  );
  return (
    <div
      onClick={openEdit}
      style={{
        background: '#fff',
        border: `1px solid ${m.accent}35`,
        borderRadius: 10,
        padding: '10px 16px',
        minWidth: 130,
        boxShadow: `0 1px 4px ${m.accent}12`,
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: "'Inter', sans-serif",
        cursor: 'pointer',
      }}>
      <Handle type="target" position={Position.Left} id="input"
        style={{ background: '#fff', width: 10, height: 10, border: `2px solid ${m.accent}`, boxShadow: `0 0 0 3px ${m.accentLight}`, left: -6 }} />
      <div style={{
        width: 26, height: 26, borderRadius: 6, flexShrink: 0,
        background: m.accentLight,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: m.accent, fontSize: 13,
      }}>
        {m.icon}
      </div>
      <span style={{ fontWeight: 600, fontSize: 13, color: m.accent, letterSpacing: '-0.02em' }}>{label}</span>
    </div>
  );
}

// ── CUSTOM_OUTPUT node ────────────────────────────────────────────────────────

function CustomOutputNode({ id, data }: NodeProps) {
  const cfg: CustomOutputNodeConfig = (data.config as CustomOutputNodeConfig) || { template: '' };
  const editCtx = useContext(EditPanelContext);
  const openEdit = () => editCtx?.openEdit({ nodeId: id, nodeType: 'CUSTOM_OUTPUT', label: data.label, config: data.config || {} });
  const m = NODE_THEME.CUSTOM_OUTPUT;
  const label = data.label || 'Custom Output';
  const preview = cfg.template ? cfg.template.slice(0, 80) + (cfg.template.length > 80 ? '…' : '') : null;
  const compact = useCompact();

  if (compact) return (
    <div style={{
      background: '#fff', border: `1.5px solid ${m.accent}45`, borderRadius: 10,
      padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 7,
      minWidth: 140, boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
    }}>
      <Handle type="target" position={Position.Left} id="input"
        style={{ background: '#fff', width: 8, height: 8, border: `2px solid ${m.accent}`, left: -5 }} />
      <div style={{ width: 22, height: 22, borderRadius: 5, flexShrink: 0, background: m.accentLight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: m.accent, fontSize: 12 }}>{m.icon}</div>
      <span style={{ fontWeight: 600, fontSize: 12, color: m.accent }}>{label}</span>
    </div>
  );

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${m.accent}35`,
      borderRadius: 10,
      padding: '10px 16px 12px',
      minWidth: 180, maxWidth: 240,
      boxShadow: `0 1px 4px ${m.accent}12`,
      fontFamily: "'Inter', sans-serif",
      cursor: 'pointer',
    }}
      onClick={openEdit}
    >
      <Handle type="target" position={Position.Left} id="input"
        style={{ background: '#fff', width: 10, height: 10, border: `2px solid ${m.accent}`, boxShadow: `0 0 0 3px ${m.accentLight}`, left: -6 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: preview ? 8 : 0 }}>
        <div style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
          background: m.accentLight,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: m.accent, fontSize: 13,
        }}>
          {m.icon}
        </div>
        <span style={{ fontWeight: 600, fontSize: 13, color: m.accent, letterSpacing: '-0.02em' }}>{label}</span>
      </div>
      {preview && (
        <div style={{
          fontSize: 10, color: '#64748b',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          background: '#f0fdfe', borderRadius: 4, padding: '4px 6px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          border: `1px solid ${m.accent}20`,
        }}>
          {preview}
        </div>
      )}
      {!preview && (
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Click to add template</div>
      )}
    </div>
  );
}

// ── Node type registry ────────────────────────────────────────────────────────

const NODE_TYPES = { START: StartNode, RULE: RuleNode, BRANCH: BranchNode, SOURCE: SourceNode, WORKFLOW: WorkflowNode, MODEL: ModelNode, OUTCOME: OutcomeNode, CUSTOM_OUTPUT: CustomOutputNode };

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

function makeNode(type: string, position: { x: number; y: number }, extra?: Record<string, unknown>): Node {
  const id = `${type.toLowerCase()}_${uid()}`;
  const label =
    type === 'START'         ? 'START' :
    type === 'RULE'          ? 'Rule Node' :
    type === 'BRANCH'        ? 'Branch' :
    type === 'SOURCE'        ? 'Source' :
    type === 'WORKFLOW'      ? 'Workflow' :
    type === 'MODEL'         ? 'Model Set' :
    type === 'CUSTOM_OUTPUT' ? 'Custom Output' :
    (extra?.outcome as string) || 'Outcome';
  const config =
    type === 'CUSTOM_OUTPUT' ? { template: '' } :
    extra || {};
  return { id, type, position, data: { label, config } };
}

function rfNodesToPolicy(nodes: Node[], edges: Edge[]): { policyNodes: PolicyNode[]; policyEdges: PolicyEdge[] } {
  return {
    policyNodes: nodes.map(n => ({ id: n.id, type: n.type as PolicyNode['type'], name: n.data.label, position: n.position, config: n.data.config || {} })),
    policyEdges: edges.map(e => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle || 'next', target: e.target })),
  };
}

// ── Inline editors ────────────────────────────────────────────────────────────

// ── Field label helper ────────────────────────────────────────────────────────

function FieldGroup({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
        {label}
      </div>
      {hint && <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 5, lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </div>
  );
}

// ── Expression input with on-blur validation ──────────────────────────────────

// ── LOOKUP() autocomplete helpers ─────────────────────────────────────────────

/** Given the text before the cursor, determine autocomplete intent. */
function detectLookupIntent(textBefore: string): {
  type: 'name' | 'column';
  typed: string;
  lookupName?: string;
} | null {
  // Inside second arg: LOOKUP("name", "<cursor>
  const colMatch = textBefore.match(/LOOKUP\s*\(\s*"([^"]+)"\s*,\s*"([^"]*)$/i);
  if (colMatch) return { type: 'column', typed: colMatch[2], lookupName: colMatch[1] };
  // Inside first arg: LOOKUP("<cursor>
  const nameMatch = textBefore.match(/LOOKUP\s*\(\s*"([^"]*)$/i);
  if (nameMatch) return { type: 'name', typed: nameMatch[1] };
  return null;
}

// ── Shared expression editor core (used inline + in expand modal) ─────────────

function ExpressionEditorCore({
  value, onChange, placeholder, rows = 2,
  textareaRef, onBlurValidate, inlineSuggestions = false,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
  textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  onBlurValidate: (val: string) => void;
  /** When true, suggestions render in document flow below the textarea instead of
   *  absolutely positioned — use this inside modals to avoid clipping. */
  inlineSuggestions?: boolean;
}) {
  const { meta: lookupsMeta, fetchColumns } = useContext(LookupMetaContext);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [intent, setIntent]           = useState<ReturnType<typeof detectLookupIntent>>(null);

  const handleChange = useCallback(async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val    = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;
    onChange(val);

    const detected = detectLookupIntent(val.slice(0, cursor));
    setIntent(detected);
    if (!detected) { setSuggestions([]); return; }

    if (detected.type === 'name') {
      setSuggestions(Object.keys(lookupsMeta).filter(n => n.toLowerCase().startsWith(detected.typed.toLowerCase())));
    } else {
      const lookupName = detected.lookupName!;
      let cols = lookupsMeta[lookupName] ?? [];
      // If columns aren't in the cached meta yet, fetch them on-demand from the BE
      if (cols.length === 0) {
        cols = await fetchColumns(lookupName);
      }
      setSuggestions(cols.filter(c => c.toLowerCase().startsWith(detected.typed.toLowerCase())));
    }
  }, [onChange, lookupsMeta, fetchColumns]);

  const applySuggestion = useCallback((suggestion: string) => {
    if (!intent) return;
    const el     = textareaRef.current;
    const cursor = el?.selectionStart ?? value.length;
    const newVal = value.slice(0, cursor - intent.typed.length) + suggestion + value.slice(cursor);
    onChange(newVal);
    setSuggestions([]);
    setIntent(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = cursor - intent.typed.length + suggestion.length;
      el?.setSelectionRange(pos, pos);
    });
  }, [value, onChange, intent, textareaRef]);

  const suggestionBox = suggestions.length > 0 && (
    <div style={{
      ...(inlineSuggestions
        ? { marginTop: 6, borderRadius: 6 }
        : { position: 'absolute', top: '100%', marginTop: 2, zIndex: 1000, borderRadius: 6 }),
      background: '#1e293b', border: '1px solid #334155',
      boxShadow: '0 4px 16px rgba(0,0,0,0.25)', minWidth: 200, maxWidth: '100%',
      maxHeight: 160, overflowY: 'auto',
    }}>
      <div style={{ fontSize: 9, color: '#64748b', padding: '4px 10px 2px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {intent?.type === 'column' ? `Column — ${intent.lookupName}` : 'Lookup name'}
      </div>
      {suggestions.map(s => (
        <div key={s}
          onMouseDown={e => { e.preventDefault(); applySuggestion(s); }}
          style={{ padding: '5px 10px', fontSize: 11, cursor: 'pointer', color: '#e2e8f0', fontFamily: "'JetBrains Mono', monospace" }}
          onMouseEnter={e => (e.currentTarget.style.background = '#334155')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >{s}</div>
      ))}
    </div>
  );

  return (
    <div style={{ position: inlineSuggestions ? undefined : 'relative' }}>
      <Input.TextArea
        ref={node => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          textareaRef.current = (node as any)?.resizableTextArea?.textArea ?? null;
        }}
        size="small" value={value} rows={rows}
        onChange={handleChange}
        onBlur={e => { onBlurValidate(e.target.value); setTimeout(() => setSuggestions([]), 150); }}
        placeholder={placeholder}
        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, borderRadius: 6, resize: 'vertical' }}
      />
      {suggestionBox}
    </div>
  );
}

function ExpressionInput({
  value, onChange, placeholder = 'expression', rows = 2, label, isTemplate = false,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
  label: string;
  isTemplate?: boolean;
}) {
  const [error, setError]     = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Separate refs for inline and modal editors so each manages its own DOM node
  const inlineRef = useRef<HTMLTextAreaElement | null>(null);
  const modalRef  = useRef<HTMLTextAreaElement | null>(null);

  const validate = useCallback(async (expr: string) => {
    if (!expr?.trim()) { setError(null); return; }
    setChecking(true);
    try {
      const entry: ExpressionEntry = isTemplate
        ? { label, template: expr }
        : { label, expression: expr };
      const res = await validateExpressions([entry]);
      setError(res.errors.length > 0 ? res.errors[0].message : null);
    } catch { /* network error — don't block */ }
    finally { setChecking(false); }
  }, [label, isTemplate]);

  return (
    <>
      {/* ── Inline editor ─────────────────────────────────────────────── */}
      <div style={{ position: 'relative' }}>
        <ExpressionEditorCore
          value={value} onChange={onChange} placeholder={placeholder}
          rows={rows} textareaRef={inlineRef} onBlurValidate={validate}
        />
        {/* Expand button */}
        <Tooltip title="Expand editor">
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); setExpanded(true); }}
            style={{
              position: 'absolute', top: 5, right: 5,
              background: 'transparent', border: 'none',
              color: '#c8d0da', cursor: 'pointer',
              padding: 2, lineHeight: 1,
              display: 'flex', alignItems: 'center',
              opacity: 0.6,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
          >
            <ExpandOutlined style={{ fontSize: 11 }} />
          </button>
        </Tooltip>
        {checking && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Checking…</div>}
        {error && !checking && (
          <div style={{ fontSize: 10, color: '#ef4444', marginTop: 3, lineHeight: 1.4, display: 'flex', gap: 4 }}>
            <span>⚠</span><span>{error}</span>
          </div>
        )}
      </div>

      {/* ── Expand modal ──────────────────────────────────────────────── */}
      <Modal
        open={expanded}
        onCancel={() => setExpanded(false)}
        footer={null}
        width={760}
        title={
          <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#e2e8f0' }}>
            {label}
          </span>
        }
        styles={{
          header: { background: '#0f172a', borderBottom: '1px solid #1e293b', paddingBottom: 12 },
          content: { background: '#0f172a', padding: 0 },
          body: { padding: '16px 20px 20px' },
          mask: { backdropFilter: 'blur(2px)' },
        }}
      >
        <ExpressionEditorCore
          value={value} onChange={onChange} placeholder={placeholder}
          rows={16} textareaRef={modalRef} onBlurValidate={validate} inlineSuggestions
        />
        {checking && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>Checking…</div>}
        {error && !checking && (
          <div style={{ fontSize: 11, color: '#ef4444', marginTop: 8, lineHeight: 1.5, display: 'flex', gap: 6 }}>
            <span>⚠</span><span>{error}</span>
          </div>
        )}
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="primary" size="small" onClick={() => { validate(value); setExpanded(false); }}>
            Done
          </Button>
        </div>
      </Modal>
    </>
  );
}

// ── Collect all expressions from nodes for batch validation ───────────────────

function collectExpressionsFromNodes(nodes: Node[]): ExpressionEntry[] {
  const entries: ExpressionEntry[] = [];
  for (const node of nodes) {
    const cfg = node.data?.config || {};
    const lbl = (node.data?.label as string) || node.id;

    if (node.type === 'RULE') {
      ((cfg as RuleNodeConfig).rules || []).forEach((r, i) => {
        if (r.expression?.trim())
          entries.push({ label: `${lbl} › rule[${i}] ${r.name}`, expression: r.expression });
        if (r.cantDecideExpression?.trim())
          entries.push({ label: `${lbl} › rule[${i}] ${r.name} (cantDecide)`, expression: r.cantDecideExpression });
      });
    }
    if (node.type === 'BRANCH') {
      ((cfg as BranchNodeConfig).conditions || []).forEach((c, i) => {
        if (c.expression?.trim())
          entries.push({ label: `${lbl} › condition[${i}] ${c.id}`, expression: c.expression });
      });
    }
    if (node.type === 'OUTCOME') {
      Object.entries((cfg as OutcomeNodeConfig).outputExpressions || {}).forEach(([k, v]) => {
        if (v?.trim()) entries.push({ label: `${lbl} › outputExpression ${k}`, expression: v });
      });
    }
    if (node.type === 'MODEL') {
      ((cfg as ModelNodeConfig).models || []).forEach((m, i) => {
        if (m.type === 'EXPRESSION' && m.expression?.trim())
          entries.push({ label: `${lbl} › model[${i}] ${m.name}`, expression: m.expression });
      });
    }
    if (node.type === 'CUSTOM_OUTPUT') {
      const tpl = (cfg as CustomOutputNodeConfig).template;
      if (tpl?.trim()) entries.push({ label: `${lbl} › template`, template: tpl });
    }
  }
  return entries;
}

function InlineRuleEditor({ rules, onChange }: { rules: GraphRule[]; onChange: (r: GraphRule[]) => void }) {
  const add = () => onChange([...rules, { name: `rule_${rules.length + 1}`, expression: '', priority: rules.length + 1 }]);
  const update = (i: number, field: keyof GraphRule, val: string | number) => {
    const copy = [...rules]; (copy[i] as unknown as Record<string, unknown>)[field] = val; onChange(copy);
  };
  const remove = (i: number) => onChange(rules.filter((_, idx) => idx !== i));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rules.map((r, i) => (
        <div key={i} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          {/* Card header */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', gap: 8 }}>
            <span style={{ width: 18, height: 18, background: '#e0e7ff', color: '#6366f1', borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
              {i + 1}
            </span>
            <span style={{ fontWeight: 600, fontSize: 12, color: '#1e293b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.name || `Rule ${i + 1}`}
            </span>
            <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center', fontSize: 12, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>
              <DeleteOutlined />
            </button>
          </div>
          {/* Fields */}
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <FieldGroup label="Name">
              <Input size="small" value={r.name} onChange={e => update(i, 'name', e.target.value)} style={{ borderRadius: 6 }} />
            </FieldGroup>
            <FieldGroup label="Expression">
              <ExpressionInput
                value={r.expression} onChange={v => update(i, 'expression', v)}
                label={`rule ${r.name || i} › expression`} />
            </FieldGroup>
            <FieldGroup label="Can't Decide Expression">
              <ExpressionInput
                value={r.cantDecideExpression || ''} onChange={v => update(i, 'cantDecideExpression', v)}
                placeholder="e.g. bureau.score IS NULL"
                label={`rule ${r.name || i} › cantDecide`} />
            </FieldGroup>
          </div>
        </div>
      ))}
      <button onClick={add} style={{ background: '#fff', border: '1.5px dashed #c7d2fe', borderRadius: 8, color: '#6366f1', fontSize: 12, fontWeight: 600, padding: '8px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', transition: 'background 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#eef2ff')}
        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
        <PlusOutlined style={{ fontSize: 11 }} /> Add Rule
      </button>
    </div>
  );
}

function InlineConditionEditor({ conditions, onChange }: { conditions: BranchCondition[]; onChange: (c: BranchCondition[]) => void }) {
  const add = () => onChange([...conditions, { id: `condition${conditions.length + 1}`, expression: '', label: `Condition ${conditions.length + 1}` }]);
  const update = (i: number, field: keyof BranchCondition, val: string) => {
    const copy = [...conditions]; (copy[i] as unknown as Record<string, unknown>)[field] = val; onChange(copy);
  };
  const remove = (i: number) => onChange(conditions.filter((_, idx) => idx !== i));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {conditions.map((c, i) => (
        <div key={i} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', background: '#fffbeb', borderBottom: '1px solid #fef3c7', gap: 8 }}>
            <span style={{ width: 18, height: 18, background: '#fef3c7', color: '#d97706', borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>IF</span>
            <span style={{ fontWeight: 600, fontSize: 12, color: '#1e293b', flex: 1 }}>{c.label || `Condition ${i + 1}`}</span>
            <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center', fontSize: 12 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>
              <DeleteOutlined />
            </button>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <FieldGroup label="Label">
              <Input size="small" value={c.label || ''} onChange={e => update(i, 'label', e.target.value)} style={{ borderRadius: 6 }} />
            </FieldGroup>
            <FieldGroup label="Expression">
              <ExpressionInput
                value={c.expression} onChange={v => update(i, 'expression', v)}
                label={`branch ${c.id} › expression`} />
            </FieldGroup>
          </div>
        </div>
      ))}
      <button onClick={add} style={{ background: '#fff', border: '1.5px dashed #fcd34d', borderRadius: 8, color: '#d97706', fontSize: 12, fontWeight: 600, padding: '8px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', transition: 'background 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#fffbeb')}
        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
        <PlusOutlined style={{ fontSize: 11 }} /> Add Condition
      </button>
    </div>
  );
}

function ModelSetEditor({
  models, onChange, onOpenSubEditor,
}: { models: ModelEntry[]; onChange: (m: ModelEntry[]) => void; nodeId?: string; onOpenSubEditor: (i: number, m: ModelEntry) => void }) {
  const add = () => onChange([...models, { name: `model_${models.length + 1}`, type: 'EXPRESSION', priority: models.length + 1, resultKey: '', expression: '' }]);
  const update = (i: number, patch: Partial<ModelEntry>) => { const copy = [...models]; copy[i] = { ...copy[i], ...patch }; onChange(copy); };
  const remove = (i: number) => onChange(models.filter((_, idx) => idx !== i));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {models.map((m, i) => (
        <div key={i} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', background: '#fff7ed', borderBottom: '1px solid #fed7aa', gap: 8 }}>
            <span style={{ width: 18, height: 18, background: '#fed7aa', color: '#ea580c', borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
              {i + 1}
            </span>
            <span style={{ fontWeight: 600, fontSize: 12, color: '#1e293b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.name || `Model ${i + 1}`}
            </span>
            <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center', fontSize: 12 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>
              <DeleteOutlined />
            </button>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <FieldGroup label="Name">
                  <Input size="small" value={m.name} onChange={e => update(i, { name: e.target.value })} style={{ borderRadius: 6 }} />
                </FieldGroup>
              </div>
              <div style={{ flex: 1 }}>
                <FieldGroup label="Type">
                  <Select size="small" value={m.type} onChange={v => update(i, { type: v as ModelType })}
                    style={{ width: '100%' }}
                    options={[{ value: 'EXPRESSION', label: 'Expression' }, { value: 'SCORECARD', label: 'Scorecard' }, { value: 'DECISION_TABLE', label: 'Decision Table' }]} />
                </FieldGroup>
              </div>
            </div>
            <FieldGroup label="Result Key">
              <Input size="small" value={m.resultKey || ''} onChange={e => update(i, { resultKey: e.target.value })}
                placeholder={m.name || 'e.g. dpd_score'} style={{ borderRadius: 6 }} />
            </FieldGroup>
            {m.type === 'EXPRESSION' && (
              <FieldGroup label="Expression">
                <ExpressionInput
                  value={m.expression || ''} onChange={v => update(i, { expression: v })}
                  label={`model ${m.name || i} › expression`} />
              </FieldGroup>
            )}
            {(m.type === 'SCORECARD' || m.type === 'DECISION_TABLE') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
                <TableOutlined style={{ color: '#2563eb', fontSize: 14 }} />
                <span style={{ fontSize: 12, flex: 1, color: '#1e40af', fontWeight: 500 }}>
                  {m.inlineDefinition ? '✓ Definition configured' : 'Not configured yet'}
                </span>
                <Button size="small" type="primary" ghost onClick={() => onOpenSubEditor(i, m)} style={{ borderRadius: 6 }}>Open Editor ↗</Button>
              </div>
            )}
          </div>
        </div>
      ))}
      <button onClick={add} style={{ background: '#fff', border: '1.5px dashed #fed7aa', borderRadius: 8, color: '#ea580c', fontSize: 12, fontWeight: 600, padding: '8px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', transition: 'background 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#fff7ed')}
        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
        <PlusOutlined style={{ fontSize: 11 }} /> Add Model
      </button>
    </div>
  );
}

function InlineCustomOutputEditor({ template, onChange }: { template: string; onChange: (t: string) => void }) {
  return (
    <FieldGroup
      label="Template"
      hint={'JSON-like structure. Quoted values are literals; unquoted values are expressions. Use workflows[\'policyId version\'].outcome to reference sub-policy results.'}
    >
      <ExpressionInput
        value={template} onChange={onChange} rows={14}
        placeholder={`[\n  {\n    "bank_name": "AU Small Finance Bank",\n    "decision": IFELSE(workflows['LMP_AU v1.0'].outcome == "approved", "approved", "rejected")\n  }\n]`}
        label="custom output › template" isTemplate />
    </FieldGroup>
  );
}

function InlineOutcomeEditor({ config, onChange }: {
  config: OutcomeNodeConfig;
  onChange: (c: OutcomeNodeConfig) => void;
}) {
  const fields: Record<string, unknown> = config.outputFields || {};
  const fieldEntries = Object.entries(fields);

  const addField = () => {
    const key = `field_${fieldEntries.length + 1}`;
    onChange({ ...config, outputFields: { ...fields, [key]: '' } });
  };
  const updateFieldKey = (oldKey: string, newKey: string) => {
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) { next[k === oldKey ? newKey : k] = v; }
    onChange({ ...config, outputFields: next });
  };
  const updateFieldVal = (key: string, val: string) => {
    onChange({ ...config, outputFields: { ...fields, [key]: val } });
  };
  const removeField = (key: string) => {
    const next = { ...fields }; delete next[key];
    onChange({ ...config, outputFields: next });
  };

  const exprs: Record<string, string> = config.outputExpressions || {};
  const exprEntries = Object.entries(exprs);

  const addExpr = () => {
    const key = `expr_${exprEntries.length + 1}`;
    onChange({ ...config, outputExpressions: { ...exprs, [key]: '' } });
  };
  const updateExprKey = (oldKey: string, newKey: string) => {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(exprs)) { next[k === oldKey ? newKey : k] = v; }
    onChange({ ...config, outputExpressions: next });
  };
  const updateExprVal = (key: string, val: string) => {
    onChange({ ...config, outputExpressions: { ...exprs, [key]: val } });
  };
  const removeExpr = (key: string) => {
    const next = { ...exprs }; delete next[key];
    onChange({ ...config, outputExpressions: next });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <FieldGroup label="Outcome Value">
        <Input
          value={config.outcome || ''}
          onChange={e => onChange({ ...config, outcome: e.target.value })}
          placeholder="e.g. approved"
          style={{ borderRadius: 6 }}
        />
      </FieldGroup>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Output Fields</div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 10, lineHeight: 1.6 }}>
          Static key-value pairs returned with the outcome result.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {fieldEntries.map(([key, val]) => (
            <div key={key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Input
                size="small"
                value={key}
                onChange={e => updateFieldKey(key, e.target.value)}
                placeholder="key"
                style={{ width: 110, flexShrink: 0, borderRadius: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
              />
              <Input
                size="small"
                value={val === null || val === undefined ? '' : String(val)}
                onChange={e => updateFieldVal(key, e.target.value)}
                placeholder="value"
                style={{ flex: 1, borderRadius: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
              />
              <button onClick={() => removeField(key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center', fontSize: 12, flexShrink: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>
                <DeleteOutlined />
              </button>
            </div>
          ))}
          <button onClick={addField} style={{ background: '#fff', border: '1.5px dashed #d1d5db', borderRadius: 8, color: '#6b7280', fontSize: 12, fontWeight: 600, padding: '7px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
            onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
            <PlusOutlined style={{ fontSize: 11 }} /> Add Field
          </button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Output Expressions</div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 10, lineHeight: 1.6 }}>
          Evaluated at runtime against context. Merged with static output fields; expressions win on key conflicts.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {exprEntries.map(([key, val]) => (
            <div key={key} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <Input
                size="small"
                value={key}
                onChange={e => updateExprKey(key, e.target.value)}
                placeholder="key"
                style={{ width: 110, flexShrink: 0, borderRadius: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
              />
              <div style={{ flex: 1 }}>
                <ExpressionInput
                  value={val} onChange={v => updateExprVal(key, v)}
                  placeholder="expression" rows={1}
                  label={`outcome › outputExpression ${key}`} />
              </div>
              <button onClick={() => removeExpr(key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center', fontSize: 12, flexShrink: 0, marginTop: 4 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>
                <DeleteOutlined />
              </button>
            </div>
          ))}
          <button onClick={addExpr} style={{ background: '#fff', border: '1.5px dashed #d1d5db', borderRadius: 8, color: '#6b7280', fontSize: 12, fontWeight: 600, padding: '7px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
            onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
            <PlusOutlined style={{ fontSize: 11 }} /> Add Expression
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Right edit panel (Drawer) ─────────────────────────────────────────────────

interface ActiveEdit extends EditRequest {
  workflowOutcomes?: string[];
}

function RightEditPanel({
  active, onClose, onSave, onOpenModelEditor, onDelete,
}: {
  active: ActiveEdit | null;
  onClose: () => void;
  onSave: (nodeId: string, config: Record<string, unknown>, label?: string, workflowOutcomes?: string[]) => void;
  onOpenModelEditor: (nodeId: string, i: number, m: ModelEntry) => void;
  onDelete?: (nodeId: string) => void;
}) {
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>({});
  const [localLabel, setLocalLabel] = useState('');
  const [localOutcomes, setLocalOutcomes] = useState<string[]>([]);
  const [newOutcome, setNewOutcome] = useState('');
  const [allPolicies, setAllPolicies] = useState<PolicySummary[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [outcomesLoading, setOutcomesLoading] = useState(false);
  const [policyVersions, setPolicyVersions] = useState<PolicySummary[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  useEffect(() => {
    if (active) {
      setLocalConfig(active.config);
      setLocalLabel(active.label || '');
      setLocalOutcomes(active.workflowOutcomes || ['APPROVED', 'REJECTED']);
    }
    // Fetch policy list + versions whenever a WORKFLOW node is opened
    if (active?.nodeType === 'WORKFLOW') {
      setPoliciesLoading(true);
      fetchAllPolicies()
        .then(setAllPolicies)
        .catch(() => {})
        .finally(() => setPoliciesLoading(false));

      // If a policy is already configured on this node, pre-load its versions
      const existingPolicyId = active.config?.policyId as string | undefined;
      if (existingPolicyId) {
        setVersionsLoading(true);
        fetchVersions(existingPolicyId)
          .then(setPolicyVersions)
          .catch(() => setPolicyVersions([]))
          .finally(() => setVersionsLoading(false));
      } else {
        setPolicyVersions([]);
      }
    }
  }, [active?.nodeId]);

  if (!active) return null;

  const hc = active.nodeType === 'OUTCOME'
    ? (OUTCOME_META[((active.config?.outcome as string) || '').toUpperCase()] || NODE_THEME.OUTCOME)
    : (NODE_THEME[active.nodeType] || NODE_THEME.RULE);

  const handleSave = () => {
    onSave(active.nodeId, localConfig, localLabel, localOutcomes);
    onClose();
  };

  return (
    <Drawer
      open={!!active}
      onClose={onClose}
      width={380}
      styles={{ header: { display: 'none' }, body: { padding: 0, background: '#f8fafc' } }}
      mask={false}
    >
      {/* Panel header */}
      <div style={{
        background: '#fff',
        borderTop: `3px solid ${hc.accent}`,
        padding: '16px 20px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        borderBottom: '1px solid #f1f5f9',
      }}>
        <div style={{
          width: 38, height: 38,
          borderRadius: 10,
          background: hc.accentLight,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: hc.accent, fontSize: 17,
          flexShrink: 0,
        }}>
          {active.nodeType === 'RULE'          ? <ThunderboltOutlined /> :
           active.nodeType === 'BRANCH'        ? <ForkOutlined /> :
           active.nodeType === 'SOURCE'        ? <DatabaseOutlined /> :
           active.nodeType === 'WORKFLOW'      ? <ApiOutlined /> :
           active.nodeType === 'MODEL'         ? <CalculatorOutlined /> :
           active.nodeType === 'OUTCOME'       ? <CheckCircleOutlined /> :
           active.nodeType === 'CUSTOM_OUTPUT' ? <FunctionOutlined /> :
           <EllipsisOutlined />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center',
            background: hc.accentLight, color: hc.accent,
            borderRadius: 4, padding: '1px 8px',
            fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
            marginBottom: 4,
          }}>
            {active.nodeType.replace(/_/g, ' ')}
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {active.label}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: '#f1f5f9', border: 'none', borderRadius: 6,
          color: '#64748b', cursor: 'pointer',
          width: 28, height: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, flexShrink: 0,
        }}>✕</button>
      </div>

      {/* Panel body */}
      <div style={{ padding: '20px', overflowY: 'auto', height: 'calc(100% - 120px)' }}>

        {/* Node name */}
        <div style={{ background: '#fff', borderRadius: 10, padding: '14px 16px', marginBottom: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <FieldGroup label="Node Name">
            <Input value={localLabel} onChange={e => setLocalLabel(e.target.value)}
              style={{ borderRadius: 6, fontSize: 13 }} />
          </FieldGroup>
        </div>

        {/* Type-specific editor in a card */}
        <div style={{ background: active.nodeType === 'CUSTOM_OUTPUT' || active.nodeType === 'OUTCOME' ? 'transparent' : 'transparent' }}>

          {active.nodeType === 'RULE' && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Rules</div>
              <InlineRuleEditor
                rules={(localConfig.rules as GraphRule[]) || []}
                onChange={rules => setLocalConfig(c => ({ ...c, rules }))}
              />
            </div>
          )}

          {active.nodeType === 'BRANCH' && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Conditions</div>
              <InlineConditionEditor
                conditions={(localConfig.conditions as BranchCondition[]) || []}
                onChange={conditions => setLocalConfig(c => ({ ...c, conditions }))}
              />
            </div>
          )}

          {active.nodeType === 'SOURCE' && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Sources</div>
              <SourceSelector
                value={((localConfig.sources as (SourceItem | string)[]) || []).map(s =>
                  typeof s === 'string' ? { type: 'lookup' as const, id: s, label: s } : s
                )}
                onChange={sources => setLocalConfig(c => ({ ...c, sources }))}
              />
            </div>
          )}

          {active.nodeType === 'WORKFLOW' && (
            <div style={{ background: '#fff', borderRadius: 10, padding: '14px 16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <FieldGroup label="Policy">
                <Select
                  showSearch
                  loading={policiesLoading}
                  value={(localConfig.policyId as string) || undefined}
                  placeholder="Search and select a policy…"
                  optionFilterProp="label"
                  style={{ width: '100%' }}
                  onChange={(val: string) => {
                    // Reset version when policy changes
                    setLocalConfig(c => ({ ...c, policyId: val, version: '' }));
                    setPolicyVersions([]);
                    if (!val) return;

                    // Fetch available versions for the version dropdown
                    setVersionsLoading(true);
                    fetchVersions(val)
                      .then(setPolicyVersions)
                      .catch(() => setPolicyVersions([]))
                      .finally(() => setVersionsLoading(false));

                    // Auto-populate Expected Outcomes from the selected policy's OUTCOME nodes
                    const summary = allPolicies.find(p => p.policyId === val);
                    if (!summary) return;
                    setOutcomesLoading(true);
                    fetchPolicyDefinition(val, summary.version)
                      .then(policy => {
                        const outcomes = [
                          ...new Set(
                            (policy.nodes || [])
                              .filter(n => n.type === 'OUTCOME')
                              .map(n => (n.config as { outcome?: string })?.outcome)
                              .filter((o): o is string => !!o)
                          ),
                        ];
                        if (outcomes.length > 0) setLocalOutcomes(outcomes);
                      })
                      .catch(() => {})
                      .finally(() => setOutcomesLoading(false));
                  }}
                  allowClear
                  options={allPolicies.filter(p => p.status === 'ACTIVE').map(p => ({
                    value: p.policyId,
                    label: p.name || p.policyId,
                    desc: p.policyId,
                  }))}
                  optionRender={option => (
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{option.data.label}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{option.data.desc}</div>
                    </div>
                  )}
                />
              </FieldGroup>
              <FieldGroup label="Version" hint="Only active versions shown. Leave blank to always use the latest.">
                <Select
                  style={{ width: '100%' }}
                  loading={versionsLoading}
                  value={(localConfig.version as string) || undefined}
                  placeholder="Latest active (default)"
                  allowClear
                  onChange={(val: string | undefined) => setLocalConfig(c => ({ ...c, version: val ?? '' }))}
                  disabled={!localConfig.policyId}
                  options={[
                    {
                      value: '',
                      label: (
                        <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                          Latest active (default)
                        </span>
                      ),
                    },
                    ...policyVersions.filter(v => v.status === 'ACTIVE').map(v => ({
                      value: v.version,
                      label: (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: '20px' }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                            {v.version}
                          </span>
                          <span style={{
                            fontSize: 10, fontWeight: 600,
                            padding: '0px 5px', lineHeight: '16px',
                            borderRadius: 8, flexShrink: 0,
                            ...(v.status === 'ACTIVE'
                              ? { color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0' }
                              : { color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0' }),
                          }}>
                            {v.status}
                          </span>
                        </div>
                      ),
                    })),
                  ]}
                />
              </FieldGroup>
              <FieldGroup label="Result Key" hint="Defaults to policyId if blank">
                <Input value={(localConfig.resultKey as string) || ''} onChange={e => setLocalConfig(c => ({ ...c, resultKey: e.target.value }))}
                  placeholder={(localConfig.policyId as string) || 'defaults to policyId'} style={{ borderRadius: 6 }} />
              </FieldGroup>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Expected Outcomes
                  {outcomesLoading && <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— detecting…</span>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {localOutcomes.map(o => (
                    <Tag key={o} closable onClose={() => setLocalOutcomes(localOutcomes.filter(x => x !== o))} color="blue" style={{ borderRadius: 6 }}>{o}</Tag>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input size="small" value={newOutcome} onChange={e => setNewOutcome(e.target.value.toUpperCase())}
                    placeholder="Add outcome" style={{ flex: 1, borderRadius: 6 }}
                    onPressEnter={() => { if (newOutcome) { setLocalOutcomes([...localOutcomes, newOutcome]); setNewOutcome(''); } }} />
                  <Button size="small" onClick={() => { if (newOutcome) { setLocalOutcomes([...localOutcomes, newOutcome]); setNewOutcome(''); } }} style={{ borderRadius: 6 }}>Add</Button>
                </div>
              </div>
            </div>
          )}

          {active.nodeType === 'MODEL' && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Models</div>
              <ModelSetEditor
                models={(localConfig.models as ModelEntry[]) || []}
                onChange={models => setLocalConfig(c => ({ ...c, models }))}
                nodeId={active.nodeId}
                onOpenSubEditor={(i, m) => { onSave(active.nodeId, { ...localConfig }, localLabel); onOpenModelEditor(active.nodeId, i, m); onClose(); }}
              />
            </div>
          )}

          {active.nodeType === 'OUTCOME' && (
            <div style={{ background: '#fff', borderRadius: 10, padding: '14px 16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <InlineOutcomeEditor
                config={localConfig as unknown as OutcomeNodeConfig}
                onChange={cfg => setLocalConfig(cfg as unknown as Record<string, unknown>)}
              />
            </div>
          )}

          {active.nodeType === 'CUSTOM_OUTPUT' && (
            <div style={{ background: '#fff', borderRadius: 10, padding: '14px 16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <InlineCustomOutputEditor
                template={(localConfig.template as string) || ''}
                onChange={template => setLocalConfig(c => ({ ...c, template }))}
              />
            </div>
          )}
        </div>
      </div>

      {/* Panel footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', background: '#fff', boxShadow: '0 -2px 8px rgba(0,0,0,0.04)' }}>
        {active.nodeType !== 'START' && onDelete && (
          <button
            onClick={() => Modal.confirm({
              title: `Delete "${active.label}"?`,
              content: 'This will also remove all edges connected to this node. This action cannot be undone.',
              okText: 'Delete Node',
              okButtonProps: { danger: true },
              cancelText: 'Cancel',
              onOk: () => { onDelete(active.nodeId); onClose(); },
            })}
            style={{
              width: '100%', marginBottom: 8,
              background: 'none', border: '1px solid #fca5a5',
              borderRadius: 8, height: 32,
              color: '#ef4444', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#f87171'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = '#fca5a5'; }}
          >
            <DeleteOutlined style={{ fontSize: 11 }} /> Delete Node
          </button>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={onClose} style={{ flex: 1, borderRadius: 8, height: 36 }}>Cancel</Button>
          <Button type="primary" onClick={handleSave} style={{ flex: 2, background: hc.accent, borderColor: hc.accent, borderRadius: 8, height: 36, fontWeight: 600 }}>Save Changes</Button>
        </div>
      </div>
    </Drawer>
  );
}

// ── Quick-add menu ────────────────────────────────────────────────────────────

function QuickAddMenu({ screenPos, onSelect, onClose }: {
  screenPos: { x: number; y: number };
  onSelect: (type: string, extra?: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={onClose} />
      <div style={{
        position: 'fixed', left: screenPos.x + 12, top: screenPos.y - 8,
        zIndex: 9999, background: '#fff', border: '1px solid #e2e8f0',
        borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
        minWidth: 180, overflow: 'hidden',
      }}>
        <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
          Add Block
        </div>
        {PALETTE_BLOCKS.map(b => (
          <QuickAddRow key={b.type} icon={b.icon} label={b.label} color={b.color} bg={b.bg}
            onClick={() => { onSelect(b.type); onClose(); }} />
        ))}
        <div style={{ height: 1, background: '#f1f5f9' }} />
        <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
          Add Outcome
        </div>
        {PALETTE_OUTCOMES.map(o => (
          <QuickAddRow key={o.label} icon={o.icon} label={o.label} color={o.color} bg={o.bg}
            onClick={() => {
              if (o.type === 'CUSTOM_OUTPUT') {
                onSelect('CUSTOM_OUTPUT', { template: '' });
              } else {
                onSelect('OUTCOME', { outcome: o.outcome || '' });
              }
              onClose();
            }} />
        ))}
      </div>
    </>
  );
}

function QuickAddRow({ icon, label, color, bg, onClick }: { icon: React.ReactNode; label: string; color: string; bg: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', width: '100%', border: 'none', background: hover ? bg : 'transparent', cursor: 'pointer', fontSize: 13, color, fontWeight: 500, textAlign: 'left' }}>
      {icon} {label}
    </button>
  );
}

// ── Palette grid item ─────────────────────────────────────────────────────────

function PaletteGridItem({ nodeType, label, icon, color, bg, extra }: {
  nodeType: string; label: string; icon: React.ReactNode; color: string; bg: string; extra?: Record<string, unknown>;
}) {
  const [hover, setHover] = useState(false);
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/reactflow', JSON.stringify({ nodeType, extra }));
    e.dataTransfer.effectAllowed = 'move';
  };
  return (
    <div
      draggable onDragStart={onDragStart}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        padding: '14px 8px 12px',
        borderRadius: 12, cursor: 'grab', userSelect: 'none',
        background: hover ? '#fff' : '#fff',
        border: `1.5px solid ${hover ? color + '50' : '#edf0f4'}`,
        boxShadow: hover
          ? `0 4px 16px ${color}18, 0 1px 4px rgba(0,0,0,0.06)`
          : '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'all 0.15s ease',
        transform: hover ? 'translateY(-1px)' : 'none',
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, fontSize: 20,
        transition: 'all 0.15s',
      }}>
        {icon}
      </div>
      <span style={{
        fontSize: 11.5, fontWeight: 500, textAlign: 'center', lineHeight: 1.2,
        color: hover ? color : '#374151',
        transition: 'color 0.15s',
      }}>
        {label}
      </span>
    </div>
  );
}

// ── Policy metadata modal ─────────────────────────────────────────────────────

interface PolicyMeta { policyId: string; version: string; name: string; description: string; createdBy: string; }

function toSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function PolicyMetaModal({ open, initial, locked, onOk, onCancel }: {
  open: boolean; initial?: Partial<PolicyMeta>; locked?: boolean;
  onOk: (meta: PolicyMeta) => void; onCancel: () => void;
}) {
  const [meta, setMeta] = useState<PolicyMeta>({ policyId: '', version: '1.0', name: '', description: '', createdBy: '', ...initial });
  useEffect(() => { if (open) setMeta(m => ({ ...m, ...initial })); }, [open]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setMeta(m => ({ ...m, name, policyId: toSlug(name) }));
  };
  const set = (k: keyof PolicyMeta) => (e: React.ChangeEvent<HTMLInputElement>) => setMeta(m => ({ ...m, [k]: e.target.value }));

  return (
    <Modal title="New Policy" open={open} onOk={() => onOk(meta)} onCancel={onCancel}
      okText="Open Editor" okButtonProps={{ disabled: !meta.name.trim() }} width={420}>
      <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 8 }}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>Policy Name *</Text>
          <Input value={meta.name} onChange={handleNameChange} disabled={locked}
            placeholder="e.g. Loan Approval Policy" style={{ marginTop: 4 }} autoFocus />
          {meta.policyId && (
            <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
              ID: <Text code style={{ fontSize: 11 }}>{meta.policyId}</Text>
            </Text>
          )}
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>Version *</Text>
          <Input value={meta.version} onChange={set('version')} disabled={locked} placeholder="1.0" style={{ marginTop: 4 }} />
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>Description</Text>
          <Input value={meta.description} onChange={set('description')} placeholder="Optional" style={{ marginTop: 4 }} />
        </div>

      </Space>
    </Modal>
  );
}

// ── Edit mode state ───────────────────────────────────────────────────────────

export interface EditorState {
  mode: 'new' | 'editDraft' | 'newVersion';
  meta: PolicyMeta;
  originalPolicyId?: string;
  originalVersion?: string;
  nodes: Node[];
  edges: Edge[];
}

// ── Main editor content ───────────────────────────────────────────────────────

function PolicyEditorContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const incomingState = location.state as EditorState | null;

  const [metaOpen, setMetaOpen] = useState(!incomingState);
  const [meta, setMeta] = useState<PolicyMeta>(incomingState?.meta || { policyId: '', version: '1.0', name: '', description: '', createdBy: '' });
  const [editorMode] = useState<'new' | 'editDraft' | 'newVersion'>(incomingState?.mode || 'new');
  const [originalPolicyId] = useState(incomingState?.originalPolicyId);
  const [originalVersion]  = useState(incomingState?.originalVersion);

  const [nodes, setNodes] = useState<Node[]>(() => {
    const raw = incomingState?.nodes || [
      { id: 'start', type: 'START', position: { x: 100, y: 200 }, data: { label: 'START' } },
    ];
    // Auto-layout when loading an existing policy (more than just the start node)
    const rawEdges = incomingState?.edges || [];
    return raw.length > 1 ? getAutoLayout(raw, rawEdges) : raw;
  });
  const [edges, setEdges] = useState<Edge[]>(incomingState?.edges || []);

  // ── Refs that always hold the latest nodes/edges (avoid stale closures) ──────
  const nodesRef = useRef<Node[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // ── Undo / redo history ───────────────────────────────────────────────────────
  const historyStack = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const historyPointer = useRef(-1);
  const savedPointer   = useRef(0);   // pointer value at last successful save / initial load
  const skipHistory = useRef(false);
  const [isDirty, setIsDirty] = useState(false);

  // Initialize history with starting state on mount
  useEffect(() => {
    historyStack.current = [{ nodes: nodesRef.current, edges: edgesRef.current }];
    historyPointer.current = 0;
    savedPointer.current   = 0;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Unsaved-changes guard ─────────────────────────────────────────────────────

  // Block in-app navigation (sidebar links, back button, programmatic navigate)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    Modal.confirm({
      title: 'Unsaved changes',
      content: 'You have unsaved changes that will be lost if you leave. Save the policy first, or discard your changes.',
      okText: 'Leave anyway',
      cancelText: 'Stay & save',
      okButtonProps: { danger: true },
      onOk:    () => blocker.proceed(),
      onCancel: () => blocker.reset(),
    });
  }, [blocker.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Block browser refresh / tab close
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ExpressionValidationError[]>([]);
  const [validationPanelOpen, setValidationPanelOpen] = useState(false);

  // ── Lookup metadata for LOOKUP() autocomplete ────────────────────────────────
  // Only show lookups that are actually declared in SOURCE nodes of this policy.
  // Columns are shown when available (populated at upload time); name suggestions
  // always work even if column metadata is absent.
  const [allLookups, setAllLookups] = useState<LookupSummary[]>([]);
  useEffect(() => {
    fetchAllLookups().then(setAllLookups).catch(() => {});
  }, []);
  const lookupsMeta = useMemo<Record<string, string[]>>(() => {
    // Collect lookup IDs from all SOURCE nodes in the current graph.
    // Sources can be stored as plain strings OR as SourceItem objects — handle both.
    const sourcedIds = new Set<string>();
    nodes.forEach(node => {
      const sources = (node.data?.config as Record<string, unknown> | undefined)?.sources;
      if (!Array.isArray(sources)) return;
      (sources as (SourceItem | string)[]).forEach(s => {
        if (typeof s === 'string') {
          if (s) sourcedIds.add(s);                    // plain lookupId string
        } else if (s.type === 'lookup' && s.id) {
          sourcedIds.add(s.id);                        // SourceItem object
        }
      });
    });

    // Build meta: all sourced lookupIds as keys; columns if available, empty array if not
    const byId = Object.fromEntries(allLookups.map(l => [l.lookupId, l.columns ?? []]));
    return Object.fromEntries(
      Array.from(sourcedIds).map(id => [id, byId[id] ?? []])
    );
  }, [allLookups, nodes]);

  // In-memory cache so repeated column fetches don't hit the network again
  const columnsCacheRef = useRef<Record<string, string[]>>({});

  const fetchColumnsForLookup = useCallback(async (lookupId: string): Promise<string[]> => {
    if (columnsCacheRef.current[lookupId]) return columnsCacheRef.current[lookupId];
    try {
      const cols = await fetchLookupColumns(lookupId);
      columnsCacheRef.current[lookupId] = cols;
      // Also patch allLookups so lookupsMeta picks up the columns on next render
      setAllLookups(prev => prev.map(l =>
        l.lookupId === lookupId ? { ...l, columns: cols } : l
      ));
      return cols;
    } catch {
      return [];
    }
  }, []);

  const [refOpen, setRefOpen] = useState(false);
  const [refSection, setRefSection] = useState<string | undefined>(undefined);

  const openRef = (nodeType?: string) => {
    setRefSection(nodeType ? (NODE_TYPE_TO_SECTION[nodeType] ?? 'overview') : 'overview');
    setRefOpen(true);
  };

  const [paletteOpen, setPaletteOpen] = useState(true);

  // Right panel state
  const [activeEdit, setActiveEdit] = useState<ActiveEdit | null>(null);

  // Quick-add state
  const connectingHandle = useRef<{ nodeId: string; handleId: string | null } | null>(null);
  const [quickAdd, setQuickAdd] = useState<{ screenPos: { x: number; y: number }; flowPos: { x: number; y: number } } | null>(null);

  // ── History helpers ──────────────────────────────────────────────────────────

  const pushHistory = useCallback((newNodes: Node[], newEdges: Edge[]) => {
    if (skipHistory.current) return;
    historyStack.current = historyStack.current.slice(0, historyPointer.current + 1);
    historyStack.current.push({ nodes: newNodes, edges: newEdges });
    if (historyStack.current.length > 60) historyStack.current.shift();
    else historyPointer.current++;
    setIsDirty(historyPointer.current !== savedPointer.current);
  }, []);

  const undo = useCallback(() => {
    if (historyPointer.current <= 0) return;
    historyPointer.current--;
    const snap = historyStack.current[historyPointer.current];
    skipHistory.current = true;
    setNodes(snap.nodes);
    setEdges(snap.edges);
    skipHistory.current = false;
    setIsDirty(historyPointer.current !== savedPointer.current);
  }, [setNodes, setEdges]);

  const redo = useCallback(() => {
    if (historyPointer.current >= historyStack.current.length - 1) return;
    historyPointer.current++;
    const snap = historyStack.current[historyPointer.current];
    skipHistory.current = true;
    setNodes(snap.nodes);
    setEdges(snap.edges);
    skipHistory.current = false;
    setIsDirty(historyPointer.current !== savedPointer.current);
  }, [setNodes, setEdges]);

  // ── Callbacks ───────────────────────────────────────────────────────────────

  const onConfigChange = useCallback((id: string, cfg: Record<string, unknown>) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, config: cfg } } : n));
  }, []);

  const onLabelChange = useCallback((id: string, label: string) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, label } } : n));
  }, []);

  const onWorkflowOutcomesChange = useCallback((id: string, outcomes: string[]) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, workflowOutcomes: outcomes } } : n));
  }, []);

  const openEdit = useCallback((req: EditRequest & { workflowOutcomes?: string[] }) => {
    setActiveEdit(req as ActiveEdit);
  }, []);

  const handleEditSave = useCallback((nodeId: string, config: Record<string, unknown>, label?: string, workflowOutcomes?: string[]) => {
    const newNodes = nodesRef.current.map(n => {
      if (n.id !== nodeId) return n;
      const newData = { ...n.data, config };
      if (label !== undefined) newData.label = label;
      if (workflowOutcomes !== undefined) newData.workflowOutcomes = workflowOutcomes;
      return { ...n, data: newData };
    });
    pushHistory(newNodes, edgesRef.current);
    setNodes(newNodes);
  }, [pushHistory]);

  const onOpenModelEditor = useCallback((nodeId: string, modelIndex: number, model: ModelEntry) => {
    const route = model.type === 'SCORECARD' ? '/editor/scorecard' : '/editor/decision-table';
    const serializableNodes = nodes.map(n => ({ ...n, data: { label: n.data.label, config: n.data.config, workflowOutcomes: n.data.workflowOutcomes } }));
    navigate(route, {
      state: {
        nodeId, modelIndex, model,
        returnState: { mode: editorMode, meta, originalPolicyId, originalVersion, nodes: serializableNodes, edges } as EditorState,
      },
    });
  }, [nodes, edges, editorMode, meta, originalPolicyId, originalVersion, navigate]);

  // Attach context callbacks to all nodes
  const nodesWithCallbacks = nodes.map(n => ({
    ...n,
    data: { ...n.data, onConfigChange, onLabelChange, onWorkflowOutcomesChange },
  }));

  // ── Flow event handlers ─────────────────────────────────────────────────────

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes(nds => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges(eds => applyEdgeChanges(changes, eds)), []);

  const onConnect = useCallback((connection: Connection) => {
    // Each output handle must connect to exactly one target.
    // Block the connection if this source handle already has an outgoing edge.
    const alreadyConnected = edgesRef.current.some(
      e => e.source === connection.source && e.sourceHandle === connection.sourceHandle,
    );
    if (alreadyConnected) {
      message.warning({
        content: 'This output is already connected. Remove the existing connection first.',
        key: 'duplicate-edge',
      });
      return;
    }
    const newEdges = addEdge({
      ...connection, id: `e_${uid()}`,
      type: 'default',
      ...edgeProps(connection.sourceHandle),
    }, edgesRef.current);
    pushHistory(nodesRef.current, newEdges);
    setEdges(newEdges);
  }, [pushHistory]);

  const onConnectStart = useCallback((_: React.MouseEvent | React.TouchEvent, params: { nodeId: string | null; handleId: string | null }) => {
    connectingHandle.current = { nodeId: params.nodeId || '', handleId: params.handleId };
  }, []);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    if (!connectingHandle.current) return;
    const target = event.target as Element;
    if (!target.classList.contains('react-flow__pane')) { connectingHandle.current = null; return; }
    const me = event as MouseEvent;
    setQuickAdd({ screenPos: { x: me.clientX, y: me.clientY }, flowPos: screenToFlowPosition({ x: me.clientX, y: me.clientY }) });
  }, [screenToFlowPosition]);

  const handleQuickAdd = useCallback((type: string, extra?: Record<string, unknown>) => {
    if (!quickAdd || !connectingHandle.current) return;

    // Block if this handle already has an outgoing edge
    const alreadyConnected = edgesRef.current.some(
      e => e.source === connectingHandle.current!.nodeId &&
           e.sourceHandle === connectingHandle.current!.handleId,
    );
    if (alreadyConnected) {
      message.warning({
        content: 'This output is already connected. Remove the existing connection first.',
        key: 'duplicate-edge',
      });
      setQuickAdd(null);
      connectingHandle.current = null;
      return;
    }

    const newNode = makeNode(type, quickAdd.flowPos, extra);
    const newEdge: Edge = {
      id: `e_${uid()}`,
      source: connectingHandle.current.nodeId,
      sourceHandle: connectingHandle.current.handleId,
      target: newNode.id,
      type: 'default',
      ...edgeProps(connectingHandle.current.handleId),
    };
    const newNodes = [...nodesRef.current, newNode];
    const newEdges = [...edgesRef.current, newEdge];
    pushHistory(newNodes, newEdges);
    setNodes(newNodes);
    setEdges(newEdges);
    connectingHandle.current = null;
  }, [quickAdd, pushHistory]);

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const typeData = e.dataTransfer.getData('application/reactflow');
    if (!typeData) return;
    const { nodeType, extra } = JSON.parse(typeData) as { nodeType: string; extra?: Record<string, unknown> };
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const newNode = makeNode(nodeType, position, extra);
    const newNodes = [...nodesRef.current, newNode];
    pushHistory(newNodes, edgesRef.current);
    setNodes(newNodes);
  }, [screenToFlowPosition, pushHistory]);

  const deleteSelected = useCallback(() => {
    const cur = nodesRef.current;
    const curEdges = edgesRef.current;
    const deletedIds = new Set(cur.filter(n => n.selected && n.type !== 'START').map(n => n.id));
    const newNodes = cur.filter(n => !n.selected || n.type === 'START');
    const newEdges = curEdges.filter(e => !e.selected && !deletedIds.has(e.source) && !deletedIds.has(e.target));
    pushHistory(newNodes, newEdges);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [pushHistory]);

  const deleteNodeById = useCallback((nodeId: string) => {
    const newNodes = nodesRef.current.filter(n => n.id !== nodeId);
    const newEdges = edgesRef.current.filter(e => e.source !== nodeId && e.target !== nodeId);
    pushHistory(newNodes, newEdges);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [pushHistory]);

  const confirmDelete = useCallback(() => {
    const selectedNodes = nodes.filter(n => n.selected && n.type !== 'START');
    const selectedEdges = edges.filter(e => e.selected);
    // Also count edges that would be removed because their node is deleted
    const deletedNodeIds = new Set(selectedNodes.map(n => n.id));
    const danglingEdges  = edges.filter(e => !e.selected && (deletedNodeIds.has(e.source) || deletedNodeIds.has(e.target)));

    if (selectedNodes.length === 0 && selectedEdges.length === 0) return;

    const parts: string[] = [];
    if (selectedNodes.length > 0)
      parts.push(`${selectedNodes.length} node${selectedNodes.length > 1 ? 's' : ''}`);
    const totalEdges = selectedEdges.length + danglingEdges.length;
    if (totalEdges > 0)
      parts.push(`${totalEdges} edge${totalEdges > 1 ? 's' : ''}`);

    Modal.confirm({
      title: 'Delete selected elements?',
      content: `This will permanently remove ${parts.join(' and ')}. This action cannot be undone.`,
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: deleteSelected,
    });
  }, [nodes, edges, deleteSelected]);

  // Keyboard delete — Delete or Backspace triggers confirmation; Cmd/Ctrl+Z/Y for undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z') {
        if (isEditing) return;
        e.preventDefault();
        undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        if (isEditing) return;
        e.preventDefault();
        redo();
        return;
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (isEditing) return;
      confirmDelete();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [confirmDelete, undo, redo]);

  // ── Validate all ────────────────────────────────────────────────────────────

  const handleValidateAll = async () => {
    const entries = collectExpressionsFromNodes(nodes);
    if (entries.length === 0) { message.info('No expressions to validate'); return; }
    setValidating(true);
    try {
      const result = await validateExpressions(entries);
      setValidationErrors(result.errors);
      setValidationPanelOpen(true);
      if (result.valid) message.success(`All ${entries.length} expressions valid`);
    } catch {
      message.error('Validation request failed');
    } finally {
      setValidating(false);
    }
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleExport = () => {
    const { policyNodes, policyEdges } = rfNodesToPolicy(nodes, edges);
    const exportData: SavePolicyRequest = {
      description: meta.description || undefined,
      createdBy:   meta.createdBy   || undefined,
      policy: { id: meta.policyId, version: meta.version, name: meta.name || meta.policyId, type: 'RULE_CHAIN', nodes: policyNodes, edges: policyEdges },
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${meta.policyId || 'policy'}_${meta.version || '1.0'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    if (!meta.policyId || !meta.version) { message.error('Policy ID and Version are required'); return; }

    // Validate all expressions before saving
    const entries = collectExpressionsFromNodes(nodes);
    if (entries.length > 0) {
      setValidating(true);
      let result;
      try {
        result = await validateExpressions(entries);
      } catch {
        message.error('Validation request failed — cannot save');
        setValidating(false);
        return;
      } finally {
        setValidating(false);
      }
      if (!result.valid) {
        setValidationErrors(result.errors);
        setValidationPanelOpen(true);
        message.error(`Fix ${result.errors.length} expression error${result.errors.length > 1 ? 's' : ''} before saving`);
        return;
      }
      setValidationErrors([]);
    }

    const { policyNodes, policyEdges } = rfNodesToPolicy(nodes, edges);
    const req: SavePolicyRequest = {
      description: meta.description || undefined,
      createdBy:   meta.createdBy   || undefined,
      policy: { id: meta.policyId, version: meta.version, name: meta.name || meta.policyId, type: 'RULE_CHAIN', nodes: policyNodes, edges: policyEdges },
    };
    setSaving(true);
    try {
      if (editorMode === 'editDraft' && originalPolicyId && originalVersion) {
        await updateDraftPolicy(originalPolicyId, originalVersion, req);
        message.success('Draft saved');
      } else {
        await createPolicy(req);
        message.success('Policy created');
      }
      // Mark as clean so the navigation blocker doesn't fire after save
      savedPointer.current = historyPointer.current;
      setIsDirty(false);
      navigate('/');
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const pageTitle = meta.name || meta.policyId || 'New Policy';

  return (
    <LookupMetaContext.Provider value={{ meta: lookupsMeta, fetchColumns: fetchColumnsForLookup }}>
    <EditPanelContext.Provider value={{ openEdit }}>
    <ModelEditorContext.Provider value={{ openModelEditor: onOpenModelEditor }}>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f1f5f9' }}>

      {/* ── Brand gradient strip ──────────────────────────────────────── */}
      <div style={{
        height: 2, flexShrink: 0,
        background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 55%, #a855f7 100%)',
      }} />

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div style={{
        height: 52, background: '#0f172a', flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 0,
      }}>
        {/* Minerva logo mark — click to go home */}
        <div
          onClick={() => navigate('/')}
          style={{
            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', marginRight: 14,
            boxShadow: '0 2px 8px rgba(99,102,241,0.4)',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <ThunderboltFilled style={{ color: '#fff', fontSize: 13 }} />
        </div>

        <div style={{ width: 1, height: 20, background: '#1e293b', marginRight: 14, flexShrink: 0 }} />

        {/* Policy name + badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{
            color: '#f1f5f9', fontWeight: 600, fontSize: 14,
            letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {pageTitle}
          </span>

          {/* Unsaved indicator */}
          {isDirty && (
            <Tooltip title="Unsaved changes">
              <div style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: '#f59e0b',
                boxShadow: '0 0 0 2px rgba(245,158,11,0.2)',
              }} />
            </Tooltip>
          )}

          {meta.version && (
            <span style={{
              flexShrink: 0,
              background: '#1e293b', border: '1px solid #2d3748',
              color: '#475569', fontSize: 10.5, fontWeight: 600,
              padding: '2px 8px', borderRadius: 20, letterSpacing: '0.02em',
            }}>
              v{meta.version}
            </span>
          )}

          <span style={{
            flexShrink: 0,
            background: editorMode === 'editDraft' ? 'rgba(245,158,11,0.1)' : 'rgba(99,102,241,0.1)',
            border: `1px solid ${editorMode === 'editDraft' ? 'rgba(245,158,11,0.3)' : 'rgba(99,102,241,0.3)'}`,
            color: editorMode === 'editDraft' ? '#fbbf24' : '#818cf8',
            fontSize: 10, fontWeight: 700,
            padding: '2px 8px', borderRadius: 20,
            textTransform: 'uppercase', letterSpacing: '0.07em',
          }}>
            {editorMode === 'editDraft' ? 'Draft' : 'New'}
          </span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>

          {/* Export JSON */}
          <Tooltip title="Export policy JSON">
            <Button
              size="small" icon={<DownloadOutlined />} onClick={handleExport}
              style={{
                background: 'transparent', border: '1px solid #334155',
                color: '#94a3b8', borderRadius: 7,
                width: 30, height: 30,
              }}
            />
          </Tooltip>

          <div style={{ width: 1, height: 20, background: '#334155', margin: '0 6px' }} />

          {/* Expression Reference */}
          <Tooltip title="Expression language reference">
            <Button
              size="small"
              icon={<ReadOutlined />}
              onClick={() => openRef(activeEdit?.nodeType)}
              style={{
                background: refOpen ? 'rgba(99,102,241,0.15)' : 'transparent',
                border: `1px solid ${refOpen ? '#6366f1' : '#334155'}`,
                color: refOpen ? '#818cf8' : '#94a3b8',
                borderRadius: 7, height: 30, fontSize: 12, fontWeight: 500,
                paddingLeft: 10, paddingRight: 10,
                transition: 'all 0.15s',
              }}
            >
              Expr Ref
            </Button>
          </Tooltip>

          {/* Validate */}
          <Tooltip title={
            validationErrors.length > 0
              ? `${validationErrors.length} expression error${validationErrors.length > 1 ? 's' : ''} — click to review`
              : 'Validate all expressions'
          }>
            <Button
              size="small"
              loading={validating}
              onClick={handleValidateAll}
              style={{
                background: validationErrors.length > 0 ? 'rgba(239,68,68,0.1)' : 'transparent',
                border: `1px solid ${validationErrors.length > 0 ? 'rgba(239,68,68,0.5)' : '#334155'}`,
                color: validationErrors.length > 0 ? '#f87171' : '#94a3b8',
                borderRadius: 7, height: 30, fontSize: 12, fontWeight: 500,
                paddingLeft: 10, paddingRight: 10,
                transition: 'all 0.15s',
              }}
            >
              {!validating && (validationErrors.length > 0
                ? `⚠ ${validationErrors.length} error${validationErrors.length > 1 ? 's' : ''}`
                : '✓ Validate')}
            </Button>
          </Tooltip>

          <div style={{ width: 1, height: 20, background: '#334155', margin: '0 6px' }} />

          {/* Save */}
          <Button
            type="primary" loading={saving} onClick={handleSave}
            icon={!saving ? <SaveOutlined /> : undefined}
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              border: 'none', borderRadius: 7, height: 34,
              fontWeight: 600, fontSize: 13, letterSpacing: '-0.01em',
              paddingLeft: 16, paddingRight: 16,
              boxShadow: '0 1px 6px rgba(99,102,241,0.4)',
            }}
          >
            {editorMode === 'editDraft' ? 'Save Draft' : 'Save Policy'}
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>

        {/* ── Left palette ─────────────────────────────────────────── */}
        <div style={{
          width: paletteOpen ? 220 : 0,
          background: '#f8f9fb',
          borderRight: paletteOpen ? '1px solid #e8ecf0' : 'none',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
          overflow: 'hidden',
          transition: 'width 0.2s ease',
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 12px 13px 16px',
            borderBottom: '1px solid #e8ecf0',
            display: 'flex', alignItems: 'center', gap: 8,
            width: 220, boxSizing: 'border-box',
            background: '#fff',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              flexShrink: 0,
            }} />
            <span style={{
              flex: 1, fontSize: 12, fontWeight: 600, color: '#111827',
              letterSpacing: '-0.01em',
            }}>
              Add Block
            </span>
            <button
              onClick={() => setPaletteOpen(false)}
              title="Hide panel"
              style={{
                background: 'none', border: '1px solid #e5e7eb', cursor: 'pointer',
                color: '#9ca3af', fontSize: 11, fontWeight: 700,
                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              ✕
            </button>
          </div>

          {/* Scrollable content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 10px 12px', minWidth: 220 }}>
            {/* Blocks section */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingLeft: 2 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Blocks</span>
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, #e0e7ff, transparent)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {PALETTE_BLOCKS.map(b => (
                <PaletteGridItem key={b.type} nodeType={b.type} label={b.label} icon={b.icon} color={b.color} bg={b.bg} />
              ))}
            </div>

            {/* Outcomes section */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 10px', paddingLeft: 2 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#0ea5e9', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Outcomes</span>
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, #e0f2fe, transparent)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {PALETTE_OUTCOMES.map(o => (
                <PaletteGridItem key={o.label} nodeType={o.type} label={o.label} icon={o.icon} color={o.color} bg={o.bg} extra={{ outcome: o.outcome || '' }} />
              ))}
            </div>
          </div>

          {/* Footer hint */}
          <div style={{
            padding: '10px 14px',
            borderTop: '1px solid #e8ecf0',
            background: '#fff',
            minWidth: 220,
            display: 'flex', alignItems: 'flex-start', gap: 7,
          }}>
            <span style={{ fontSize: 14, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>⌗</span>
            <span style={{ fontSize: 10.5, color: '#9ca3af', lineHeight: 1.55 }}>
              Drag onto canvas, or drop on an empty handle to connect directly.
            </span>
          </div>
        </div>

        {/* ── Reopen tab (visible only when palette is hidden) ──────── */}
        {!paletteOpen && (
          <button
            onClick={() => setPaletteOpen(true)}
            title="Show block panel"
            style={{
              position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
              zIndex: 10, writingMode: 'vertical-rl', textOrientation: 'mixed',
              background: '#fff', border: '1px solid #e2e8f0', borderLeft: 'none',
              borderRadius: '0 6px 6px 0', padding: '12px 7px',
              fontSize: 10.5, fontWeight: 600, color: '#6366f1',
              cursor: 'pointer', letterSpacing: 0.8,
              boxShadow: '2px 0 8px rgba(0,0,0,0.06)',
            }}
          >
            ADD BLOCK ▶
          </button>
        )}

        {/* ── Canvas ───────────────────────────────────────────────── */}
        <div ref={reactFlowWrapper} style={{ flex: 1, position: 'relative' }}>
          <ReactFlow
            nodes={nodesWithCallbacks}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onNodeDragStop={() => setTimeout(() => pushHistory(nodesRef.current, edgesRef.current), 0)}
            nodeTypes={NODE_TYPES}
            fitView
            deleteKeyCode={null}
            defaultEdgeOptions={{ type: 'default', ...edgeProps('next') }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#cbd5e1" />
            <Controls style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.1)', borderRadius: 8 }} />
            <MiniMap style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}
              nodeColor={n => NODE_THEME[n.type || '']?.accent || '#94a3b8'} />
            <Panel position="bottom-center">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(6px)', borderRadius: 8, padding: '4px 14px', fontSize: 11, color: '#94a3b8' }}>
                  Drag handles onto empty canvas to quickly add + connect
                </div>
                <button
                  onClick={() => setNodes(nds => getAutoLayout(nds, edges))}
                  style={{
                    background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(6px)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                    padding: '4px 12px', fontSize: 11, color: '#e2e8f0',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                    fontWeight: 500,
                  }}
                  title="Auto-arrange nodes into a clean left-to-right layout"
                >
                  ⚡ Auto Layout
                </button>
              </div>
            </Panel>
          </ReactFlow>
        </div>
      </div>

      {/* ── Right edit panel ──────────────────────────────────────────── */}
      <RightEditPanel
        active={activeEdit}
        onClose={() => setActiveEdit(null)}
        onSave={handleEditSave}
        onOpenModelEditor={onOpenModelEditor}
        onDelete={deleteNodeById}
      />

      {/* ── Quick-add menu ────────────────────────────────────────────── */}
      {quickAdd && (
        <QuickAddMenu
          screenPos={quickAdd.screenPos}
          onSelect={handleQuickAdd}
          onClose={() => { setQuickAdd(null); connectingHandle.current = null; }}
        />
      )}

      {/* ── Policy metadata modal ────────────────────────────────────── */}
      <PolicyMetaModal
        open={metaOpen}
        initial={meta}
        locked={editorMode === 'editDraft'}
        onOk={m => { setMeta(m); setMetaOpen(false); }}
        onCancel={() => navigate('/')}
      />

      {/* ── Expression Reference drawer ─────────────────────────────── */}
      <Drawer
        open={refOpen}
        onClose={() => setRefOpen(false)}
        placement="right"
        width={460}
        mask={false}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 6,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ color: '#fff', fontSize: 12 }}>⌨</span>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
                Expression Reference
              </div>
              <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1 }}>
                {activeEdit ? `Opened from: ${activeEdit.nodeType} node` : 'All sections'}
              </div>
            </div>
          </div>
        }
        styles={{
          header: { borderBottom: '1px solid #e2e8f0', padding: '14px 16px' },
          body:   { padding: '16px', overflowY: 'auto' },
        }}
        style={{ boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}
      >
        {/* Section jump chips */}
        <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            { id: 'operators',        label: 'Operators' },
            { id: 'conditionals',     label: 'Conditions' },
            { id: 'functions',        label: 'Functions' },
            { id: 'lookups',          label: 'Lookups' },
            { id: 'let-blocks',       label: 'LET' },
            { id: 'workflow-results', label: 'Workflows' },
            { id: 'custom-output',    label: 'Templates' },
            { id: 'quick-reference',  label: 'Quick Ref' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => {
                setRefSection(id);
                const el = document.getElementById(`ref-sec-${id}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              style={{
                padding: '3px 10px',
                borderRadius: 20,
                border: `1px solid ${refSection === id ? '#6366f1' : '#e2e8f0'}`,
                background: refSection === id ? '#eef2ff' : '#fff',
                color: refSection === id ? '#4f46e5' : '#64748b',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <ExpressionReference targetSection={refSection} compact />
      </Drawer>

      {/* ── Validation errors modal ──────────────────────────────────── */}
      <Modal
        open={validationPanelOpen}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {validationErrors.length === 0
              ? <CheckCircleOutlined style={{ color: '#22c55e' }} />
              : <CloseCircleOutlined style={{ color: '#ef4444' }} />}
            <span>
              {validationErrors.length === 0
                ? 'All expressions valid'
                : `${validationErrors.length} expression error${validationErrors.length > 1 ? 's' : ''} found`}
            </span>
          </div>
        }
        onCancel={() => setValidationPanelOpen(false)}
        footer={
          <Button type="primary" onClick={() => setValidationPanelOpen(false)}>Close</Button>
        }
        width={600}
      >
        {validationErrors.length === 0 ? (
          <div style={{ color: '#64748b', padding: '8px 0' }}>
            All expressions parsed successfully. You can safely save this policy.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 400, overflowY: 'auto' }}>
            {validationErrors.map((err, i) => (
              <div key={i} style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                padding: '10px 14px',
              }}>
                <div style={{ fontWeight: 600, color: '#dc2626', fontSize: 13, marginBottom: 4 }}>
                  {err.label}
                </div>
                <div style={{ color: '#7f1d1d', fontSize: 12, fontFamily: 'monospace' }}>
                  {err.message}
                  {(err.line != null || err.column != null) && (
                    <span style={{ marginLeft: 8, color: '#991b1b', opacity: 0.7 }}>
                      (line {err.line ?? '?'}, col {err.column ?? '?'})
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
    </ModelEditorContext.Provider>
    </EditPanelContext.Provider>
    </LookupMetaContext.Provider>
  );
}

// ── Wrapper ───────────────────────────────────────────────────────────────────

export default function PolicyEditor() {
  return (
    <ReactFlowProvider>
      <PolicyEditorContent />
    </ReactFlowProvider>
  );
}
