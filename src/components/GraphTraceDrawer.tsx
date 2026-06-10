/**
 * GraphTraceDrawer
 *
 * Slide-over drawer that replays the execution path of a graph-based policy
 * evaluation on a read-only ReactFlow canvas.
 *
 * Node components intentionally mirror the exact dimensions and handle
 * positions of their PolicyEditor counterparts so the stored x/y positions
 * produce an identical layout.
 */

// @ts-ignore — dagre has no bundled types but @types/dagre is installed
import dagre from 'dagre';
import React, { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  NodeProps,
  Position,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { Alert, Button, Drawer, Spin, Tag, Tooltip, Typography } from 'antd';
import {
  ApiOutlined,
  CalculatorOutlined,
  CaretRightOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  DatabaseOutlined,
  ForkOutlined,
  FunctionOutlined,
  NodeIndexOutlined,
  PauseOutlined,
  PlayCircleOutlined,
  QuestionCircleOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';

import { fetchPolicyDefinition } from '../api/client';
import type { GraphTraceStep, NodeType, Policy } from '../types';

const { Text } = Typography;

// ── Handle → edge color (mirrors PolicyEditor's HANDLE_COLOR) ─────────────────

const HANDLE_COLOR: Record<string, string> = {
  pass:       '#22c55e',
  fail:       '#ef4444',
  cantDecide: '#f59e0b',
  next:       '#6366f1',
  default:    '#94a3b8',
};
function edgeColor(h: string | null | undefined): string {
  return HANDLE_COLOR[h ?? 'next'] ?? '#94a3b8';
}

// ── NODE_THEME (mirrors PolicyEditor) ─────────────────────────────────────────

const NODE_THEME: Record<string, { accent: string; accentLight: string }> = {
  START:         { accent: '#4f46e5', accentLight: '#eef2ff' },
  RULE:          { accent: '#4f46e5', accentLight: '#eef2ff' },
  BRANCH:        { accent: '#d97706', accentLight: '#fffbeb' },
  SOURCE:        { accent: '#dc2626', accentLight: '#fef2f2' },
  WORKFLOW:      { accent: '#2563eb', accentLight: '#eff6ff' },
  MODEL:         { accent: '#ea580c', accentLight: '#fff7ed' },
  OUTCOME:       { accent: '#16a34a', accentLight: '#f0fdf4' },
  CUSTOM_OUTPUT: { accent: '#0891b2', accentLight: '#ecfeff' },
};

// ── Trace state ───────────────────────────────────────────────────────────────

type TraceState = 'pass' | 'fail' | 'branch' | 'source' | 'outcome' | 'neutral' | 'dimmed' | null;

const TRACE_STYLES: Record<Exclude<TraceState, 'dimmed' | null>, { border: string; glow: string; badge: string }> = {
  pass:    { border: '#16a34a', glow: 'rgba(22,163,74,0.18)',   badge: '#f0fdf4' },
  fail:    { border: '#dc2626', glow: 'rgba(220,38,38,0.15)',   badge: '#fef2f2' },
  branch:  { border: '#d97706', glow: 'rgba(217,119,6,0.18)',   badge: '#fffbeb' },
  source:  { border: '#2563eb', glow: 'rgba(37,99,235,0.14)',   badge: '#eff6ff' },
  outcome: { border: '#6366f1', glow: 'rgba(99,102,241,0.22)',  badge: '#eef2ff' },
  neutral: { border: '#6b7280', glow: 'rgba(107,114,128,0.12)', badge: '#f9fafb' },
};

function getTraceState(nodeType: NodeType, handleTaken: string | null): TraceState {
  if (nodeType === 'SOURCE')                                    return 'source';
  if (nodeType === 'START')                                     return 'neutral';
  if (nodeType === 'OUTCOME' || nodeType === 'CUSTOM_OUTPUT')   return 'outcome';
  if (nodeType === 'BRANCH')                                    return 'branch';
  if (handleTaken === 'fail')                                   return 'fail';
  if (handleTaken === 'cantDecide')                             return 'neutral';
  return 'pass';
}

function getBadgeText(nodeType: NodeType, handleTaken: string | null, outcome?: string): string {
  if (nodeType === 'START')                                   return '→ start';
  if (nodeType === 'SOURCE')                                  return '✓ loaded';
  if (nodeType === 'OUTCOME' || nodeType === 'CUSTOM_OUTPUT') return outcome ? `✓ ${outcome}` : '✓ outcome';
  if (!handleTaken) return '';
  if (handleTaken === 'pass')       return '✓ pass';
  if (handleTaken === 'fail')       return '✗ fail';
  if (handleTaken === 'cantDecide') return '? undecided';
  if (handleTaken === 'next')       return '→ next';
  return `⑂ ${handleTaken}`;
}

// ── Handle styles (mirrors PolicyEditor exactly) ──────────────────────────────

const inputHandleStyle: CSSProperties = {
  background: '#fff', width: 10, height: 10,
  border: '2px solid #d1d5db',
  boxShadow: '0 0 0 3px rgba(0,0,0,0.04)',
  left: -6,
};

function inlineOutputHandle(color: string): CSSProperties {
  // Used by BRANCH: handle sits inline with its row, shifted right past the border
  return {
    background: '#fff', width: 10, height: 10,
    border: `2px solid ${color}`,
    boxShadow: `0 0 0 3px ${color}18`,
    position: 'relative',
    right: -16,
    top: 'auto',
    transform: 'none',
  };
}

// ── Trace overlay helpers ─────────────────────────────────────────────────────

/** Returns overrides for border/shadow based on trace state. Does not affect layout. */
function traceOverrides(
  traceState: TraceState,
  isCurrent: boolean,
  baseBorder: string,
): CSSProperties {
  if (!traceState)            return {};
  if (traceState === 'dimmed') return { opacity: 0.22 };
  const ts = TRACE_STYLES[traceState as Exclude<TraceState, 'dimmed' | null>];
  return {
    border: `1.5px solid ${ts.border}`,
    boxShadow: `0 0 0 3px ${ts.glow}, 0 2px 16px ${ts.glow}`,
    animation: isCurrent ? 'traceNodePulse 1.1s ease-in-out infinite' : 'none',
    zIndex: isCurrent ? 10 : undefined,
  };
}

/** Badge floated above the node (position: absolute, no layout impact). */
function TraceBadge({ traceState, badge }: { traceState: TraceState; badge: string }) {
  if (!traceState || traceState === 'dimmed' || !badge) return null;
  const ts = TRACE_STYLES[traceState as Exclude<TraceState, 'dimmed' | null>];
  return (
    <div style={{
      position: 'absolute', top: -11, right: 12, zIndex: 10,
      background: ts.badge, border: `1.5px solid ${ts.border}`,
      color: ts.border, borderRadius: 5,
      fontSize: 10, fontWeight: 700, padding: '1px 8px',
      whiteSpace: 'nowrap', pointerEvents: 'none',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    }}>
      {badge}
    </div>
  );
}

// ── Shared node data shape ────────────────────────────────────────────────────

interface TraceNodeData {
  label: string;
  nodeType: NodeType;
  config: Record<string, unknown> | null;
  traceState: TraceState;
  traceBadge: string;
  isCurrent: boolean;
}

// ── START node — matches PolicyEditor StartNode ───────────────────────────────

function TraceStartNode({ data }: NodeProps) {
  const d = data as TraceNodeData;
  const base: CSSProperties = {
    background: '#fff', border: '1px solid #e0e7ff', borderRadius: 10,
    padding: '10px 20px', minWidth: 120,
    boxShadow: '0 1px 4px rgba(79,70,229,0.08)',
    display: 'flex', alignItems: 'center', gap: 8,
    fontFamily: "'Inter', sans-serif", position: 'relative',
  };
  return (
    <div style={{ ...base, ...traceOverrides(d.traceState, d.isCurrent, '1px solid #e0e7ff') }}>
      <TraceBadge traceState={d.traceState} badge={d.traceBadge} />
      <div style={{ width: 26, height: 26, borderRadius: 6, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5', fontSize: 13 }}>
        <PlayCircleOutlined />
      </div>
      <span style={{ fontWeight: 700, fontSize: 13, color: '#4f46e5', letterSpacing: '-0.01em' }}>START</span>
      <Handle type="source" position={Position.Right} id="next"
        style={{ background: '#fff', width: 10, height: 10, border: '2px solid #4f46e5', boxShadow: '0 0 0 3px #eef2ff', right: -6 }} />
    </div>
  );
}

// ── Card shell — matches PolicyEditor NodeCard structure ──────────────────────
// Used by RULE, SOURCE, WORKFLOW, MODEL nodes.

function TraceCardShell({
  nodeType, label, children, traceState, isCurrent, traceBadge,
  outputHandles, hasInput = true,
}: {
  nodeType: string;
  label: string;
  children?: React.ReactNode;
  traceState: TraceState;
  isCurrent: boolean;
  traceBadge: string;
  outputHandles?: Array<{ id: string; color: string; label: string }>;
  hasInput?: boolean;
}) {
  const theme = NODE_THEME[nodeType] || NODE_THEME.RULE;
  const base: CSSProperties = {
    position: 'relative',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    minWidth: 300, maxWidth: 380,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    fontSize: 12,
    fontFamily: "'Inter', -apple-system, sans-serif",
    overflow: 'visible',
    transition: 'box-shadow 0.15s, border-color 0.15s',
  };
  return (
    <div style={{ ...base, ...traceOverrides(traceState, isCurrent, '1px solid #e5e7eb') }}>
      <TraceBadge traceState={traceState} badge={traceBadge} />

      {hasInput && <Handle type="target" position={Position.Left} id="input" style={inputHandleStyle} />}

      {/* Header */}
      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ width: 26, height: 26, borderRadius: 6, background: theme.accentLight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.accent, fontSize: 13, flexShrink: 0 }}>
          {nodeType === 'RULE'     && <ThunderboltOutlined />}
          {nodeType === 'SOURCE'   && <DatabaseOutlined />}
          {nodeType === 'WORKFLOW' && <ApiOutlined />}
          {nodeType === 'MODEL'    && <CalculatorOutlined />}
        </div>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.02em' }}>
          {label}
        </span>
        <span style={{ fontSize: 9, color: '#d1d5db', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
          {nodeType.replace('_', ' ')}
        </span>
      </div>

      {children}

      {/* Inputs footer — matches NodeCard */}
      <div style={{ padding: '5px 12px', borderTop: '1px solid #f3f4f6' }}>
        <span style={{ fontSize: 10, color: '#d1d5db', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Inputs</span>
      </div>

      {/* Stacked output handles on right edge */}
      {outputHandles && outputHandles.length > 0 && (
        <div style={{
          position: 'absolute', right: -6,
          top: '50%', transform: 'translateY(-50%)',
          display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
        }}>
          {outputHandles.map(h => (
            <Tooltip key={h.id} title={h.label} placement="right" mouseEnterDelay={0.4}>
              <Handle
                type="source" position={Position.Right} id={h.id}
                style={{ position: 'relative', top: 'auto', right: 'auto', transform: 'none', background: '#fff', width: 10, height: 10, border: `2px solid ${h.color}`, boxShadow: `0 0 0 3px ${h.color}22` }}
              />
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}

// ── RULE node ─────────────────────────────────────────────────────────────────

function TraceRuleNode({ data }: NodeProps) {
  const d = data as TraceNodeData;
  const rules = (d.config?.rules as Array<{ name?: string; expression?: string }> | null) ?? [];
  return (
    <TraceCardShell
      nodeType="RULE" label={d.label}
      traceState={d.traceState} isCurrent={d.isCurrent} traceBadge={d.traceBadge}
      outputHandles={[
        { id: 'pass',       label: 'Pass',         color: edgeColor('pass') },
        { id: 'fail',       label: 'Fail',          color: edgeColor('fail') },
        { id: 'cantDecide', label: "Can't Decide",  color: edgeColor('cantDecide') },
      ]}
    >
      <div>
        {rules.length === 0 ? (
          <div style={{ padding: '10px 12px', color: '#9ca3af', fontSize: 11 }}>No rules configured</div>
        ) : rules.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', padding: '7px 12px 7px 6px', borderBottom: i < rules.length - 1 ? '1px solid #f9fafb' : undefined }}>
            <span style={{ color: '#d1d5db', fontSize: 13, cursor: 'default', padding: '1px 4px 0', flexShrink: 0, lineHeight: 1.3, letterSpacing: -2 }}>⠿</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, background: '#e0e7ff', borderRadius: 4, padding: '0px 5px', flexShrink: 0, fontWeight: 600, color: '#6366f1', lineHeight: '18px' }}>{i + 1}</span>
                <span style={{ fontWeight: 600, fontSize: 12, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>{r.name || '—'}</span>
              </div>
              {r.expression && (
                <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 3, fontFamily: "'JetBrains Mono','Fira Code',monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.expression}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </TraceCardShell>
  );
}

// ── BRANCH node — handles are INLINE per row (not stacked) ────────────────────

function TraceBranchNode({ data }: NodeProps) {
  const d = data as TraceNodeData;
  const conditions = (d.config?.conditions as Array<{ id?: string; label?: string; expression?: string }> | null) ?? [];
  const theme = NODE_THEME.BRANCH;
  const base: CSSProperties = {
    position: 'relative',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    minWidth: 300, maxWidth: 380,
    boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
    fontSize: 12, overflow: 'visible',
    fontFamily: "'Inter', -apple-system, sans-serif",
  };
  return (
    <div style={{ ...base, ...traceOverrides(d.traceState, d.isCurrent, '1px solid #e5e7eb') }}>
      <TraceBadge traceState={d.traceState} badge={d.traceBadge} />
      <Handle type="target" position={Position.Left} id="input" style={inputHandleStyle} />

      {/* Header */}
      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #f3f4f6' }}>
        <div style={{ width: 26, height: 26, borderRadius: 6, background: theme.accentLight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.accent, fontSize: 13, flexShrink: 0 }}>
          <ForkOutlined />
        </div>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: '#111827' }}>{d.label || 'Branch'}</span>
        <span style={{ fontSize: 9, color: '#d1d5db', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>BRANCH</span>
      </div>

      {/* Condition rows — each with its own inline handle, matching PolicyEditor exactly */}
      <div>
        {conditions.length === 0 ? (
          <div style={{ padding: '10px 12px', color: '#9ca3af', fontSize: 11 }}>No conditions configured</div>
        ) : conditions.map(c => (
          <div key={c.id} style={{ padding: '7px 0 7px 12px', borderBottom: '1px solid #f9fafb', display: 'flex', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 8 }}>
                <span style={{ fontSize: 10, color: '#d97706', fontWeight: 700, background: '#fef3c7', borderRadius: 4, padding: '1px 6px' }}>IF</span>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>{c.label || c.id}</span>
              </div>
              {c.expression && (
                <div style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 10.5, color: '#64748b', marginTop: 4, lineHeight: 1.5 }}>
                  {c.expression}
                </div>
              )}
            </div>
            <Handle type="source" position={Position.Right} id={c.id!} style={inlineOutputHandle(theme.accent)} />
          </div>
        ))}

        {/* ELSE / default row */}
        <div style={{ padding: '7px 0 7px 12px', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 8 }}>
            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, background: '#f1f5f9', borderRadius: 4, padding: '1px 6px' }}>ELSE</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>default</span>
          </div>
          <Handle type="source" position={Position.Right} id="default" style={inlineOutputHandle('#94a3b8')} />
        </div>
      </div>

      {/* Inputs footer */}
      <div style={{ padding: '5px 12px', borderTop: '1px solid #f3f4f6' }}>
        <span style={{ fontSize: 10, color: '#d1d5db', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Inputs</span>
      </div>
    </div>
  );
}

// ── SOURCE node ───────────────────────────────────────────────────────────────

function TraceSourceNode({ data }: NodeProps) {
  const d = data as TraceNodeData;
  const rawSources = (d.config?.sources as Array<{ id?: string; label?: string } | string> | null) ?? [];
  const sources = rawSources.map(s => typeof s === 'string' ? { id: s, label: s } : s);
  return (
    <TraceCardShell
      nodeType="SOURCE" label={d.label}
      traceState={d.traceState} isCurrent={d.isCurrent} traceBadge={d.traceBadge}
      outputHandles={[{ id: 'next', label: 'Next', color: edgeColor('next') }]}
    >
      <div style={{ padding: '6px 14px 4px' }}>
        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Data Sources</span>
      </div>
      <div style={{ padding: '4px 14px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sources.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: 11 }}>No sources</div>
        ) : sources.map((s, i) => (
          <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 10px', background: '#fafafa', fontSize: 12, fontWeight: 500, color: '#0f172a' }}>
            {s.label || s.id}
          </div>
        ))}
      </div>
    </TraceCardShell>
  );
}

// ── WORKFLOW node ─────────────────────────────────────────────────────────────

function TraceWorkflowNode({ data }: NodeProps) {
  const d = data as TraceNodeData;
  const cfg = d.config as { policyId?: string; version?: string } | null;
  return (
    <TraceCardShell
      nodeType="WORKFLOW" label={d.label}
      traceState={d.traceState} isCurrent={d.isCurrent} traceBadge={d.traceBadge}
      outputHandles={[{ id: 'next', label: 'Next', color: edgeColor('next') }]}
    >
      <div style={{ padding: '8px 12px' }}>
        {cfg?.policyId ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ApiOutlined style={{ color: '#2563eb', fontSize: 13 }} />
            <span style={{ fontWeight: 600, fontSize: 12, color: '#1e40af' }}>{cfg.policyId}</span>
            {cfg.version && <span style={{ fontSize: 10, color: '#fff', background: '#2563eb', borderRadius: 4, padding: '1px 6px' }}>v{cfg.version}</span>}
          </div>
        ) : (
          <span style={{ color: '#9ca3af', fontSize: 11 }}>No policy selected</span>
        )}
      </div>
    </TraceCardShell>
  );
}

// ── MODEL node ────────────────────────────────────────────────────────────────

const MODEL_TYPE_COLOR: Record<string, { color: string; bg: string }> = {
  SCORECARD:      { color: '#7c3aed', bg: '#f5f3ff' },
  DECISION_TABLE: { color: '#2563eb', bg: '#eff6ff' },
  EXPRESSION:     { color: '#16a34a', bg: '#f0fdf4' },
};

function TraceModelNode({ data }: NodeProps) {
  const d = data as TraceNodeData;
  const models = (d.config?.models as Array<{ name?: string; type?: string }> | null) ?? [];
  return (
    <TraceCardShell
      nodeType="MODEL" label={d.label}
      traceState={d.traceState} isCurrent={d.isCurrent} traceBadge={d.traceBadge}
      outputHandles={[{ id: 'next', label: 'Next', color: edgeColor('next') }]}
    >
      <div>
        {models.length === 0 ? (
          <div style={{ padding: '10px 12px', color: '#9ca3af', fontSize: 11 }}>No models configured</div>
        ) : models.map((m, i) => {
          const meta = MODEL_TYPE_COLOR[m.type ?? ''] ?? { color: '#94a3b8', bg: '#f9fafb' };
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: i < models.length - 1 ? '1px solid #f9fafb' : undefined }}>
              <span style={{ color: '#d1d5db', fontSize: 13, letterSpacing: -2, flexShrink: 0 }}>⠿</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                <div style={{ fontSize: 10, color: meta.color, fontWeight: 600, textTransform: 'uppercase', marginTop: 1 }}>{(m.type ?? '').replace('_', ' ')}</div>
              </div>
            </div>
          );
        })}
      </div>
    </TraceCardShell>
  );
}

// ── OUTCOME node — matches PolicyEditor OutcomeNode ───────────────────────────

const OUTCOME_META: Record<string, { accent: string; accentLight: string; icon: React.ReactNode }> = {
  APPROVED:    { accent: '#16a34a', accentLight: '#f0fdf4', icon: <CheckCircleOutlined /> },
  REJECTED:    { accent: '#dc2626', accentLight: '#fef2f2', icon: <CloseCircleOutlined /> },
  CANT_DECIDE: { accent: '#d97706', accentLight: '#fffbeb', icon: <QuestionCircleOutlined /> },
};

function TraceOutcomeNode({ data }: NodeProps) {
  const d = data as TraceNodeData;
  const cfg = d.config as { outcome?: string } | null;
  const label = cfg?.outcome || d.label || 'Outcome';
  const m = OUTCOME_META[label.toUpperCase()] ?? { accent: '#6b7280', accentLight: '#f9fafb', icon: <CheckCircleOutlined /> };
  const base: CSSProperties = {
    background: '#fff', border: `1px solid ${m.accent}35`, borderRadius: 10,
    padding: '10px 16px', minWidth: 130,
    boxShadow: `0 1px 4px ${m.accent}12`,
    display: 'flex', alignItems: 'center', gap: 8,
    fontFamily: "'Inter', sans-serif", position: 'relative',
  };
  return (
    <div style={{ ...base, ...traceOverrides(d.traceState, d.isCurrent, `1px solid ${m.accent}35`) }}>
      <TraceBadge traceState={d.traceState} badge={d.traceBadge} />
      <Handle type="target" position={Position.Left} id="input"
        style={{ background: '#fff', width: 10, height: 10, border: `2px solid ${m.accent}`, boxShadow: `0 0 0 3px ${m.accentLight}`, left: -6 }} />
      <div style={{ width: 26, height: 26, borderRadius: 6, background: m.accentLight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: m.accent, fontSize: 13, flexShrink: 0 }}>
        {m.icon}
      </div>
      <span style={{ fontWeight: 600, fontSize: 13, color: m.accent, letterSpacing: '-0.02em' }}>{label}</span>
    </div>
  );
}

// ── CUSTOM_OUTPUT node — matches PolicyEditor CustomOutputNode ────────────────

function TraceCustomOutputNode({ data }: NodeProps) {
  const d = data as TraceNodeData;
  const cfg = d.config as { template?: string } | null;
  const theme = { accent: '#0891b2', accentLight: '#ecfeff' };
  const preview = cfg?.template ? cfg.template.slice(0, 80) + (cfg.template.length > 80 ? '…' : '') : null;
  const base: CSSProperties = {
    background: '#fff', border: `1px solid ${theme.accent}35`, borderRadius: 10,
    padding: '10px 16px 12px', minWidth: 180, maxWidth: 240,
    boxShadow: `0 1px 4px ${theme.accent}12`,
    fontFamily: "'Inter', sans-serif", position: 'relative',
  };
  return (
    <div style={{ ...base, ...traceOverrides(d.traceState, d.isCurrent, `1px solid ${theme.accent}35`) }}>
      <TraceBadge traceState={d.traceState} badge={d.traceBadge} />
      <Handle type="target" position={Position.Left} id="input"
        style={{ background: '#fff', width: 10, height: 10, border: `2px solid ${theme.accent}`, boxShadow: `0 0 0 3px ${theme.accentLight}`, left: -6 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: preview ? 8 : 0 }}>
        <div style={{ width: 26, height: 26, borderRadius: 6, background: theme.accentLight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.accent, fontSize: 13, flexShrink: 0 }}>
          <FunctionOutlined />
        </div>
        <span style={{ fontWeight: 600, fontSize: 13, color: theme.accent }}>{d.label || 'Custom Output'}</span>
      </div>
      {preview && (
        <div style={{ fontSize: 10, color: '#64748b', fontFamily: "'JetBrains Mono','Fira Code',monospace", background: '#f0fdfe', borderRadius: 4, padding: '4px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: `1px solid ${theme.accent}20` }}>
          {preview}
        </div>
      )}
    </div>
  );
}

// ── Node type registry ────────────────────────────────────────────────────────

const TRACE_NODE_TYPES = {
  START:         TraceStartNode,
  RULE:          TraceRuleNode,
  BRANCH:        TraceBranchNode,
  SOURCE:        TraceSourceNode,
  WORKFLOW:      TraceWorkflowNode,
  MODEL:         TraceModelNode,
  OUTCOME:       TraceOutcomeNode,
  CUSTOM_OUTPUT: TraceCustomOutputNode,
};

// ── Dagre auto-layout — exact copy of PolicyEditor's logic ───────────────────
// Ensures the trace canvas has the same clean spacing as the editor.

function estimateNodeHeight(type: string, cfg: Record<string, unknown>): number {
  if (type === 'RULE') {
    const rules = (cfg.rules as unknown[]) || [];
    const ruleRows = rules.length === 0 ? 52 : Math.min(rules.length, 4) * 52;
    return 46 + 30 + ruleRows + (rules.length > 4 ? 24 : 0) + 34 + 30 * 3 + 26;
  }
  if (type === 'BRANCH') {
    const conds = (cfg.conditions as unknown[]) || [];
    return 46 + 30 + (conds.length || 1) * 58 + 40 + 34 + 26;
  }
  if (type === 'MODEL') {
    const models = (cfg.models as unknown[]) || [];
    return 46 + 30 + Math.min(models.length || 1, 3) * 50 + (models.length > 3 ? 24 : 0) + 34 + 30 + 26;
  }
  if (type === 'SOURCE') {
    const srcs = (cfg.sources as unknown[]) || [];
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

function applyAutoLayout(policy: Policy): Policy {
  if (!policy.nodes?.length) return policy;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', ranksep: 160, nodesep: 110, marginx: 60, marginy: 60 });

  policy.nodes.forEach(n => {
    const w = NODE_LAYOUT_WIDTH[n.type] ?? 300;
    const h = estimateNodeHeight(n.type, (n.config ?? {}) as Record<string, unknown>);
    g.setNode(n.id, { width: w, height: h });
  });

  const seen = new Set<string>();
  (policy.edges ?? []).forEach(e => {
    const key = `${e.source}→${e.target}`;
    if (!seen.has(key)) {
      const isOutcome = policy.nodes!.find(n => n.id === e.target)?.type === 'OUTCOME';
      g.setEdge(e.source, e.target, { weight: isOutcome ? 1 : 2, minlen: 1 });
      seen.add(key);
    }
  });

  dagre.layout(g);

  const nodes = policy.nodes.map(n => {
    const pos = g.node(n.id);
    if (!pos) return n;
    const w = NODE_LAYOUT_WIDTH[n.type] ?? 300;
    const h = estimateNodeHeight(n.type, (n.config ?? {}) as Record<string, unknown>);
    return { ...n, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });

  return { ...policy, nodes };
}

// ── Derived ReactFlow nodes + edges from policy + trace state ─────────────────

function buildRFNodesAndEdges(
  policy: Policy,
  graphTrace: GraphTraceStep[],
  currentStep: number,
  outcome: string | undefined,
) {
  const visited = new Map<string, { state: TraceState; badge: string }>();
  const litEdgeKeys = new Set<string>();

  if (currentStep >= 0) {
    for (let i = 0; i <= currentStep && i < graphTrace.length; i++) {
      const step = graphTrace[i];
      const state  = getTraceState(step.nodeType, step.handleTaken);
      const badge  = getBadgeText(step.nodeType, step.handleTaken, i === graphTrace.length - 1 ? outcome : undefined);
      visited.set(step.nodeId, { state, badge });
      if (step.handleTaken) litEdgeKeys.add(`${step.nodeId}:${step.handleTaken}`);
    }
  }

  const traceActive = currentStep >= 0;

  const nodes = (policy.nodes ?? []).map(n => ({
    id:       n.id,
    type:     n.type,
    position: n.position,
    data: {
      label:      n.name || n.id,
      nodeType:   n.type,
      config:     n.config ?? null,
      traceState: traceActive ? (visited.get(n.id)?.state ?? 'dimmed') : null,
      traceBadge: visited.get(n.id)?.badge ?? '',
      isCurrent:  traceActive && currentStep < graphTrace.length
        ? graphTrace[currentStep]?.nodeId === n.id
        : false,
    } as TraceNodeData,
  }));

  const edges = (policy.edges ?? []).map(e => {
    const key    = `${e.source}:${e.sourceHandle}`;
    const isLit  = litEdgeKeys.has(key);
    const color  = isLit ? '#6366f1' : edgeColor(e.sourceHandle);
    const opacity = !traceActive ? 1 : isLit ? 1 : 0.2;
    return {
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle,
      target: e.target,
      targetHandle: 'input',
      type: 'default',
      animated: isLit,
      style: { stroke: color, strokeWidth: isLit ? 2.5 : 2, opacity },
      markerEnd: { type: MarkerType.ArrowClosed, color },
    };
  });

  return { nodes, edges };
}

// ── Inner content — must be inside ReactFlowProvider ─────────────────────────

interface ContentProps {
  policyId: string;
  policyVersion: string;
  policyName?: string;
  graphTrace: GraphTraceStep[];
  outcome?: string;
  evaluationMs: number;
  onClose: () => void;
}

function GraphTraceContent({ policyId, policyVersion, policyName, graphTrace, outcome, evaluationMs, onClose }: ContentProps) {
  const { fitView } = useReactFlow();

  const [policy, setPolicy]       = useState<Policy | null>(null);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentStep, setStep]    = useState(-1);
  const [playing, setPlaying]     = useState(false);
  const [speed, setSpeed]         = useState(1000);
  const playRef = useRef(playing);
  playRef.current = playing;

  const total = graphTrace.length;

  // Fetch policy definition once
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadError(null); setPolicy(null); setStep(-1);
    fetchPolicyDefinition(policyId, policyVersion)
      .then(p  => { if (!cancelled) setPolicy(applyAutoLayout(p)); })
      .catch(e => { if (!cancelled) setLoadError(e?.message ?? 'Failed to load policy graph'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [policyId, policyVersion]);

  // fitView once loaded
  useEffect(() => {
    if (!policy || loading) return;
    setTimeout(() => fitView({ padding: 0.14, duration: 400 }), 120);
  }, [policy, loading, fitView]);

  // Auto-play on load
  useEffect(() => {
    if (!policy || loading) return;
    const t = setTimeout(() => { setStep(-1); setPlaying(true); }, 500);
    return () => clearTimeout(t);
  }, [policy, loading]);

  // Playback tick
  useEffect(() => {
    if (!playing) return;
    if (currentStep >= total - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setStep(s => s + 1), speed);
    return () => clearTimeout(t);
  }, [playing, currentStep, total, speed]);

  const stopPlay  = useCallback(() => setPlaying(false), []);
  const togglePlay = useCallback(() => {
    setPlaying(p => {
      if (!p && currentStep >= total - 1) { setStep(-1); return true; }
      return !p;
    });
  }, [currentStep, total]);
  const stepBack  = useCallback(() => { stopPlay(); setStep(s => Math.max(0, s - 1)); }, [stopPlay]);
  const stepFwd   = useCallback(() => { stopPlay(); setStep(s => Math.min(total - 1, s + 1)); }, [stopPlay, total]);
  const restart   = useCallback(() => { stopPlay(); setStep(-1); setTimeout(() => setPlaying(true), 80); }, [stopPlay]);

  const { nodes, edges } = useMemo(
    () => policy ? buildRFNodesAndEdges(policy, graphTrace, currentStep, outcome) : { nodes: [], edges: [] },
    [policy, graphTrace, currentStep, outcome],
  );

  const outcomeColor = outcome?.toLowerCase().includes('reject') ? '#dc2626'
    : outcome?.toLowerCase().includes('approv') ? '#16a34a'
    : '#6366f1';

  const stepLabel    = currentStep < 0 ? '–' : `${currentStep + 1} / ${total}`;
  const activeStep   = currentStep >= 0 && currentStep < total ? graphTrace[currentStep] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Unified header bar ─────────────────────────────────────────────── */}
      <div style={{
        height: 48,
        background: '#0f172a',
        borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center',
        padding: '0 12px 0 4px', gap: 0,
        flexShrink: 0, userSelect: 'none',
      }}>
        {/* Close */}
        <Tooltip title="Close">
          <button
            onClick={onClose}
            style={{ width: 36, height: 36, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 14, flexShrink: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
          >
            <CloseOutlined />
          </button>
        </Tooltip>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: '#1e293b', margin: '0 8px', flexShrink: 0 }} />

        {/* Icon + title */}
        <NodeIndexOutlined style={{ color: '#6366f1', fontSize: 14, flexShrink: 0 }} />
        <span style={{ marginLeft: 7, fontSize: 13, fontWeight: 600, color: '#e2e8f0', letterSpacing: '-0.01em', flexShrink: 0 }}>Graph Trace</span>

        {/* Policy name + version */}
        {policyName && (
          <>
            <span style={{ margin: '0 6px', color: '#334155', fontSize: 13 }}>·</span>
            <span style={{ fontSize: 12, color: '#64748b', letterSpacing: '-0.01em' }}>{policyName}</span>
            <span style={{ marginLeft: 5, fontSize: 10, color: '#334155', background: '#1e293b', border: '1px solid #334155', borderRadius: 4, padding: '1px 6px', fontWeight: 600, letterSpacing: '0.02em' }}>{policyVersion}</span>
          </>
        )}

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: '#1e293b', margin: '0 12px', flexShrink: 0 }} />

        {/* Live dot + outcome + duration */}
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 5px #4ade80', flexShrink: 0 }} />
        {outcome && (
          <Tag style={{ margin: '0 0 0 8px', fontSize: 10, fontWeight: 700, background: outcomeColor + '18', color: outcomeColor, border: `1px solid ${outcomeColor}40`, borderRadius: 4, letterSpacing: '0.04em' }}>
            {outcome}
          </Tag>
        )}
        <span style={{ marginLeft: 8, fontSize: 11, color: '#475569' }}>{evaluationMs} ms</span>

        <div style={{ flex: 1 }} />

        {/* Step counter */}
        <span style={{ fontSize: 11, color: '#475569', marginRight: 8, fontVariantNumeric: 'tabular-nums' }}>{stepLabel}</span>

        {/* Playback controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: '#1e293b', borderRadius: 6, padding: '3px 4px' }}>
          <Tooltip title="Step back">
            <Button type="text" size="small" icon={<StepBackwardOutlined />} onClick={stepBack} disabled={currentStep <= 0}
              style={{ color: currentStep <= 0 ? '#334155' : '#94a3b8', width: 28, height: 26, padding: 0 }} />
          </Tooltip>
          <Tooltip title={playing ? 'Pause' : 'Play'}>
            <Button
              size="small"
              icon={playing ? <PauseOutlined /> : <CaretRightOutlined />}
              onClick={togglePlay}
              style={{ background: '#4f46e5', borderColor: 'transparent', color: '#fff', borderRadius: 5, height: 26, width: 32, padding: 0, fontSize: 13 }}
            />
          </Tooltip>
          <Tooltip title="Step forward">
            <Button type="text" size="small" icon={<StepForwardOutlined />} onClick={stepFwd} disabled={currentStep >= total - 1}
              style={{ color: currentStep >= total - 1 ? '#334155' : '#94a3b8', width: 28, height: 26, padding: 0 }} />
          </Tooltip>
        </div>

        {/* Speed selector */}
        <select
          value={speed}
          onChange={e => setSpeed(Number(e.target.value))}
          style={{ marginLeft: 8, background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', fontSize: 11, borderRadius: 6, padding: '4px 8px', cursor: 'pointer', outline: 'none', height: 28 }}
        >
          <option value={1000}>0.5×</option>
          <option value={600}>1×</option>
          <option value={300}>2×</option>
          <option value={120}>4×</option>
        </select>

        {/* Replay */}
        <Tooltip title="Restart from beginning">
          <button
            onClick={restart}
            style={{ marginLeft: 8, background: 'transparent', border: '1px solid #1e293b', borderRadius: 6, color: '#475569', fontSize: 11, padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, height: 28, transition: 'color 0.15s, border-color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#818cf8'; e.currentTarget.style.borderColor = '#334155'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#475569'; e.currentTarget.style.borderColor = '#1e293b'; }}
          >
            ↻ Replay
          </button>
        </Tooltip>
      </div>

      {/* Graph canvas */}
      <div style={{ flex: 1, position: 'relative' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', zIndex: 10 }}>
            <Spin size="large" tip="Loading policy graph…" />
          </div>
        )}
        {loadError && (
          <div style={{ padding: 24 }}>
            <Alert type="error" message="Could not load policy graph" description={loadError} showIcon />
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={TRACE_NODE_TYPES}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnScroll
          zoomOnScroll
          fitView
          proOptions={{ hideAttribution: true }}
          style={{ background: '#f8fafc' }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#cbd5e1" />
          <Controls style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.1)', borderRadius: 8 }} />
          <MiniMap
            style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}
            nodeColor={n => NODE_THEME[n.type || '']?.accent || '#94a3b8'}
          />
        </ReactFlow>
      </div>

      {/* Step detail strip */}
      {activeStep && activeStep.details.length > 0 && (
        <div style={{ borderTop: '1px solid #e5e7eb', padding: '10px 20px', background: '#fff', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{activeStep.nodeName}</Text>
            <Text type="secondary" style={{ fontSize: 10 }}>step {currentStep + 1} · {activeStep.durationMs} ms</Text>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {activeStep.details.map((d, i) => (
              <div key={i} style={{ background: d.result ? '#f0fdf4' : '#fef2f2', border: `1px solid ${d.result ? '#bbf7d0' : '#fecaca'}`, borderRadius: 6, padding: '4px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: d.result ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{d.result ? '✓' : '✗'}</span>
                <span style={{ color: '#374151' }}>{d.name.split(' / ').pop()}</span>
                {d.action && d.action !== (d.result ? 'pass' : 'fail') && <Tag style={{ margin: 0, fontSize: 9 }}>{d.action}</Tag>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export interface GraphTraceDrawerProps {
  open: boolean;
  onClose: () => void;
  policyId: string;
  policyVersion: string;
  graphTrace: GraphTraceStep[];
  outcome?: string;
  evaluationMs: number;
  policyName?: string;
}

export function GraphTraceDrawer({
  open, onClose,
  policyId, policyVersion, graphTrace, outcome, evaluationMs, policyName,
}: GraphTraceDrawerProps) {
  return (
    <>
      <style>{`
        @keyframes traceNodePulse {
          0%,100% { transform: scale(1); }
          50%      { transform: scale(1.015); }
        }
      `}</style>
      <Drawer
        open={open}
        onClose={onClose}
        placement="right"
        width="100vw"
        closeIcon={false}
        title={null}
        styles={{
          header:  { display: 'none' },
          body:    { padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc' },
          wrapper: { boxShadow: '-8px 0 40px rgba(0,0,0,0.35)' },
        }}
        destroyOnClose
      >
        {open && (
          <ReactFlowProvider>
            <GraphTraceContent
              policyId={policyId}
              policyVersion={policyVersion}
              policyName={policyName}
              graphTrace={graphTrace}
              outcome={outcome}
              evaluationMs={evaluationMs}
              onClose={onClose}
            />
          </ReactFlowProvider>
        )}
      </Drawer>
    </>
  );
}
