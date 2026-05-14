import { useCallback, useRef, useState, useEffect, createContext, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ReactFlow, {
  Background, Controls, MiniMap,
  addEdge, applyEdgeChanges, applyNodeChanges,
  Handle, Position,
  type Node, type Edge, type Connection,
  type NodeChange, type EdgeChange,
  type NodeProps,
  MarkerType,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Button, Input, Select, Modal, Typography, Space, Tag, Tooltip,
  Divider, message,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, PlayCircleOutlined,
  CheckCircleOutlined, CloseCircleOutlined, QuestionCircleOutlined,
  ApartmentOutlined, ThunderboltOutlined, ForkOutlined,
  DatabaseOutlined, ApiOutlined, SaveOutlined, ArrowLeftOutlined,
  CalculatorOutlined, TableOutlined, FunctionOutlined,
} from '@ant-design/icons';
import { createPolicy, updateDraftPolicy } from '../api/client';
import type {
  PolicyNode, PolicyEdge, SavePolicyRequest,
  RuleNodeConfig, BranchNodeConfig, WorkflowNodeConfig,
  OutcomeNodeConfig, GraphRule, BranchCondition,
  ModelNodeConfig, ModelEntry, ModelType,
} from '../types';

const { Text } = Typography;

// ── Model editor context (reliable cross-node navigation) ─────────────────────

interface ModelEditorContextType {
  openModelEditor: (nodeId: string, modelIndex: number, model: ModelEntry) => void;
}
const ModelEditorContext = createContext<ModelEditorContextType | null>(null);

// ── Palette config ────────────────────────────────────────────────────────────

const PALETTE_BLOCKS = [
  { type: 'RULE',     label: 'Rule',         icon: <ThunderboltOutlined />, color: '#7c3aed', bg: '#f5f3ff' },
  { type: 'BRANCH',   label: 'Branch',       icon: <ForkOutlined />,        color: '#d97706', bg: '#fffbeb' },
  { type: 'SOURCE',   label: 'Source',       icon: <DatabaseOutlined />,    color: '#dc2626', bg: '#fef2f2' },
  { type: 'WORKFLOW', label: 'Workflow',     icon: <ApiOutlined />,         color: '#2563eb', bg: '#eff6ff' },
  { type: 'MODEL',    label: 'Model Set',    icon: <CalculatorOutlined />,  color: '#ea580c', bg: '#fff7ed' },
];
const PALETTE_OUTCOMES = [
  { type: 'OUTCOME', label: 'Approved',    outcome: 'APPROVED',    color: '#16a34a', bg: '#f0fdf4' },
  { type: 'OUTCOME', label: 'Rejected',    outcome: 'REJECTED',    color: '#dc2626', bg: '#fef2f2' },
  { type: 'OUTCOME', label: "Can't Decide",outcome: 'CANT_DECIDE', color: '#d97706', bg: '#fffbeb' },
  { type: 'OUTCOME', label: 'Custom',      outcome: '',            color: '#6b7280', bg: '#f9fafb' },
];

// ── Shared node style helpers ─────────────────────────────────────────────────

const nodeCard: React.CSSProperties = {
  background: '#fff',
  border: '1.5px solid #e5e7eb',
  borderRadius: 10,
  minWidth: 220,
  maxWidth: 280,
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  fontSize: 12,
};

const nodeHeader = (color: string, bg: string): React.CSSProperties => ({
  background: bg,
  borderBottom: '1px solid #e5e7eb',
  padding: '6px 10px',
  borderRadius: '8px 8px 0 0',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  color,
  fontWeight: 600,
});

// ── START node ────────────────────────────────────────────────────────────────

function StartNode(_: NodeProps) {
  return (
    <div style={{ ...nodeCard, minWidth: 100, textAlign: 'center' }}>
      <div style={nodeHeader('#1d4ed8', '#dbeafe')}>
        <PlayCircleOutlined /> START
      </div>
      <Handle type="source" position={Position.Right} id="next"
        style={{ background: '#1d4ed8', width: 10, height: 10 }} />
    </div>
  );
}

// ── RULE node ─────────────────────────────────────────────────────────────────

function RuleNode({ id, data }: NodeProps) {
  const cfg: RuleNodeConfig = data.config || { rules: [] };
  const rules: GraphRule[] = cfg.rules || [];
  const [editing, setEditing] = useState(false);
  const [localRules, setLocalRules] = useState<GraphRule[]>(rules);

  const save = () => {
    data.onConfigChange(id, { rules: localRules });
    setEditing(false);
  };

  return (
    <div style={nodeCard}>
      <Handle type="target" position={Position.Left} id="input"
        style={{ background: '#9ca3af', width: 10, height: 10 }} />
      <div style={nodeHeader('#7c3aed', '#f5f3ff')}>
        <ThunderboltOutlined />
        <span style={{ flex: 1 }}>{data.label || 'Rule Node'}</span>
        <Button type="text" size="small" style={{ color: '#7c3aed', padding: '0 4px' }}
          onClick={() => { setLocalRules([...rules]); setEditing(true); }}>
          Edit
        </Button>
      </div>
      <div style={{ padding: '8px 10px' }}>
        {rules.length === 0
          ? <Text type="secondary" style={{ fontSize: 11 }}>No rules — click Edit</Text>
          : rules.map((r, i) => (
            <div key={i} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: i < rules.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
              <Text code style={{ fontSize: 11 }}>{r.name}</Text>
              <div style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace', marginTop: 2 }}>
                {r.expression}
              </div>
              {r.cantDecideExpression && (
                <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 9, color: '#d97706', fontWeight: 600 }}>Can't Decide:</Text>
                  <Text style={{ fontSize: 9, color: '#d97706', fontFamily: 'monospace' }}>{r.cantDecideExpression}</Text>
                </div>
              )}
            </div>
          ))
        }
      </div>
      {/* output handles */}
      <div style={{ position: 'relative', padding: '4px 10px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[
          { id: 'pass',       label: 'Pass',        color: '#16a34a' },
          { id: 'fail',       label: 'Fail',        color: '#dc2626' },
          { id: 'cantDecide', label: "Can't Decide", color: '#d97706' },
        ].map(h => (
          <div key={h.id} style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, position: 'relative' }}>
            <Text style={{ fontSize: 10, color: h.color, fontWeight: 600 }}>{h.label}</Text>
            <Handle type="source" position={Position.Right} id={h.id}
              style={{ position: 'relative', right: -18, background: h.color, width: 10, height: 10, transform: 'none' }} />
          </div>
        ))}
      </div>

      <Modal title={`Edit: ${data.label}`} open={editing} onOk={save}
        onCancel={() => setEditing(false)} width={520}>
        <InlineRuleEditor rules={localRules} onChange={setLocalRules} />
      </Modal>
    </div>
  );
}

// ── BRANCH node ───────────────────────────────────────────────────────────────

function BranchNode({ id, data }: NodeProps) {
  const cfg: BranchNodeConfig = data.config || { conditions: [] };
  const conditions: BranchCondition[] = cfg.conditions || [];
  const [editing, setEditing] = useState(false);
  const [localConds, setLocalConds] = useState<BranchCondition[]>(conditions);

  const save = () => {
    data.onConfigChange(id, { conditions: localConds });
    setEditing(false);
  };

  return (
    <div style={nodeCard}>
      <Handle type="target" position={Position.Left} id="input"
        style={{ background: '#9ca3af', width: 10, height: 10 }} />
      <div style={nodeHeader('#d97706', '#fffbeb')}>
        <ForkOutlined />
        <span style={{ flex: 1 }}>{data.label || 'Branch'}</span>
        <Button type="text" size="small" style={{ color: '#d97706', padding: '0 4px' }}
          onClick={() => { setLocalConds([...conditions]); setEditing(true); }}>
          Edit
        </Button>
      </div>
      <div style={{ padding: '8px 10px' }}>
        {conditions.length === 0
          ? <Text type="secondary" style={{ fontSize: 11 }}>No conditions — click Edit</Text>
          : conditions.map((c, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: 600, color: '#d97706' }}>If</Text>
              <Text style={{ fontSize: 11, marginLeft: 6 }}>{c.label || c.id}</Text>
              <div style={{ fontSize: 10, color: '#6b7280', fontFamily: 'monospace', marginTop: 2 }}>
                {c.expression}
              </div>
            </div>
          ))
        }
      </div>
      <div style={{ padding: '4px 10px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {conditions.map((c) => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 10, color: '#d97706', fontWeight: 600 }}>{c.label || c.id}</Text>
            <Handle type="source" position={Position.Right} id={c.id}
              style={{ position: 'relative', right: -18, background: '#d97706', width: 10, height: 10, transform: 'none' }} />
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>Default</Text>
          <Handle type="source" position={Position.Right} id="default"
            style={{ position: 'relative', right: -18, background: '#6b7280', width: 10, height: 10, transform: 'none' }} />
        </div>
      </div>

      <Modal title={`Edit Branch: ${data.label}`} open={editing} onOk={save}
        onCancel={() => setEditing(false)} width={520}>
        <InlineConditionEditor conditions={localConds} onChange={setLocalConds} />
      </Modal>
    </div>
  );
}

// ── SOURCE node ───────────────────────────────────────────────────────────────

function SourceNode({ data }: NodeProps) {
  const sources: string[] = (data.config as { sources?: string[] })?.sources || [];
  return (
    <div style={nodeCard}>
      <Handle type="target" position={Position.Left} id="input"
        style={{ background: '#9ca3af', width: 10, height: 10 }} />
      <div style={nodeHeader('#dc2626', '#fef2f2')}>
        <DatabaseOutlined />
        <span style={{ flex: 1 }}>{data.label || 'Source'}</span>
      </div>
      <div style={{ padding: '8px 10px' }}>
        {sources.length === 0
          ? <Text type="secondary" style={{ fontSize: 11 }}>No sources configured</Text>
          : sources.map((s, i) => <Tag key={i} color="red" style={{ marginBottom: 4 }}>{s}</Tag>)
        }
      </div>
      <Handle type="source" position={Position.Right} id="next"
        style={{ background: '#dc2626', width: 10, height: 10 }} />
    </div>
  );
}

// ── WORKFLOW node ─────────────────────────────────────────────────────────────

function WorkflowNode({ id, data }: NodeProps) {
  const cfg: WorkflowNodeConfig = (data.config as WorkflowNodeConfig) || {};
  const [editing, setEditing] = useState(false);
  const [policyId, setPolicyId] = useState(cfg.policyId || '');
  const [version, setVersion] = useState(cfg.version || '');
  const [resultKey, setResultKey] = useState(cfg.resultKey || '');
  const [outcomes, setOutcomes] = useState<string[]>(data.workflowOutcomes || ['APPROVED', 'REJECTED']);
  const [newOutcome, setNewOutcome] = useState('');

  const save = () => {
    data.onConfigChange(id, { policyId, version: version || undefined, resultKey: resultKey || undefined });
    data.onWorkflowOutcomesChange?.(id, outcomes);
    setEditing(false);
  };

  return (
    <div style={nodeCard}>
      <Handle type="target" position={Position.Left} id="input"
        style={{ background: '#9ca3af', width: 10, height: 10 }} />
      <div style={nodeHeader('#2563eb', '#eff6ff')}>
        <ApiOutlined />
        <span style={{ flex: 1 }}>{cfg.policyId || data.label || 'Workflow'}</span>
        <Button type="text" size="small" style={{ color: '#2563eb', padding: '0 4px' }}
          onClick={() => setEditing(true)}>
          Edit
        </Button>
      </div>
      <div style={{ padding: '8px 10px' }}>
        {cfg.policyId
          ? <>
              <Text style={{ fontSize: 11 }}>Policy: <Text code>{cfg.policyId}</Text></Text>
              {cfg.version && <div><Text type="secondary" style={{ fontSize: 10 }}>v{cfg.version}</Text></div>}
            </>
          : <Text type="secondary" style={{ fontSize: 11 }}>No policy selected</Text>
        }
      </div>
      <div style={{ padding: '4px 10px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {outcomes.map(o => (
          <div key={o} style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 10, color: '#2563eb', fontWeight: 600 }}>{o}</Text>
            <Handle type="source" position={Position.Right} id={o}
              style={{ position: 'relative', right: -18, background: '#2563eb', width: 10, height: 10, transform: 'none' }} />
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>Default</Text>
          <Handle type="source" position={Position.Right} id="default"
            style={{ position: 'relative', right: -18, background: '#6b7280', width: 10, height: 10, transform: 'none' }} />
        </div>
      </div>

      <Modal title="Configure Workflow Node" open={editing} onOk={save}
        onCancel={() => setEditing(false)} width={480}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>Policy ID</Text>
            <Input value={policyId} onChange={e => setPolicyId(e.target.value)}
              placeholder="e.g. bureau-check" style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>Version (leave blank for latest active)</Text>
            <Input value={version} onChange={e => setVersion(e.target.value)}
              placeholder="e.g. 1.0" style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>Result Key (context variable name)</Text>
            <Input value={resultKey} onChange={e => setResultKey(e.target.value)}
              placeholder={policyId || 'defaults to policyId'} style={{ marginTop: 4 }} />
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>Expected Outcomes (each becomes an output handle)</Text>
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {outcomes.map(o => (
                <Tag key={o} closable onClose={() => setOutcomes(outcomes.filter(x => x !== o))}
                  color="blue">{o}</Tag>
              ))}
            </div>
            <Space style={{ marginTop: 8 }}>
              <Input size="small" value={newOutcome} onChange={e => setNewOutcome(e.target.value.toUpperCase())}
                placeholder="Add outcome" style={{ width: 160 }}
                onPressEnter={() => { if (newOutcome) { setOutcomes([...outcomes, newOutcome]); setNewOutcome(''); } }} />
              <Button size="small" onClick={() => { if (newOutcome) { setOutcomes([...outcomes, newOutcome]); setNewOutcome(''); } }}>
                Add
              </Button>
            </Space>
          </div>
        </Space>
      </Modal>
    </div>
  );
}

// ── MODEL node ────────────────────────────────────────────────────────────────

const MODEL_TYPE_META: Record<ModelType, { label: string; icon: React.ReactNode; color: string }> = {
  SCORECARD:      { label: 'Scorecard',      icon: <CalculatorOutlined />, color: '#7c3aed' },
  DECISION_TABLE: { label: 'Decision Table', icon: <TableOutlined />,      color: '#2563eb' },
  EXPRESSION:     { label: 'Expression',     icon: <FunctionOutlined />,   color: '#16a34a' },
};

function ModelNode({ id, data }: NodeProps) {
  const cfg: ModelNodeConfig = data.config || { models: [] };
  const models: ModelEntry[] = cfg.models || [];
  const [editing, setEditing] = useState(false);
  const [localModels, setLocalModels] = useState<ModelEntry[]>(models);
  const modelEditorCtx = useContext(ModelEditorContext);

  // Keep localModels in sync when data.config changes from outside (e.g. returning from editor)
  useEffect(() => {
    setLocalModels(cfg.models || []);
  }, [data.config]);

  const save = () => {
    data.onConfigChange(id, { models: localModels });
    setEditing(false);
  };

  const addModel = () => {
    const m: ModelEntry = {
      name: `model_${localModels.length + 1}`,
      type: 'EXPRESSION',
      priority: localModels.length + 1,
      resultKey: '',
      expression: '',
    };
    setLocalModels([...localModels, m]);
  };

  const updateModel = (i: number, patch: Partial<ModelEntry>) => {
    const copy = [...localModels];
    copy[i] = { ...copy[i], ...patch };
    setLocalModels(copy);
  };

  const removeModel = (i: number) => setLocalModels(localModels.filter((_, idx) => idx !== i));

  const openInlineEditor = (i: number, m: ModelEntry) => {
    // Save current local state to node config first
    data.onConfigChange(id, { models: localModels });
    setEditing(false);
    // Use context (always fresh) instead of data prop (can be stale in React Flow)
    modelEditorCtx?.openModelEditor(id, i, m);
  };

  return (
    <div style={nodeCard}>
      <Handle type="target" position={Position.Left} id="input"
        style={{ background: '#9ca3af', width: 10, height: 10 }} />
      <div style={nodeHeader('#ea580c', '#fff7ed')}>
        <CalculatorOutlined />
        <span style={{ flex: 1 }}>{data.label || 'Model Set'}</span>
        <Button type="text" size="small" style={{ color: '#ea580c', padding: '0 4px' }}
          onClick={() => { setLocalModels([...models]); setEditing(true); }}>
          Edit
        </Button>
      </div>
      <div style={{ padding: '8px 10px' }}>
        {models.length === 0
          ? <Text type="secondary" style={{ fontSize: 11 }}>No models — click Edit</Text>
          : models.map((m, i) => {
              const meta = MODEL_TYPE_META[m.type] || MODEL_TYPE_META.EXPRESSION;
              const hasDefinition = m.type === 'EXPRESSION'
                ? !!m.expression
                : !!m.inlineDefinition;
              return (
                <div key={i} style={{
                  marginBottom: 5, display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 6px', borderRadius: 6,
                  border: `1px solid ${hasDefinition ? '#e5e7eb' : '#fca5a5'}`,
                  background: hasDefinition ? '#fafafa' : '#fef2f2',
                }}>
                  <span style={{ color: meta.color, fontSize: 12 }}>{meta.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 11, fontWeight: 600 }}>{m.name}</Text>
                    <Text type="secondary" style={{ fontSize: 9, marginLeft: 4 }}>→ {m.resultKey || m.name}</Text>
                    {m.type === 'EXPRESSION' && m.expression && (
                      <div style={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace', marginTop: 1 }}>
                        {m.expression}
                      </div>
                    )}
                  </div>
                  {(m.type === 'DECISION_TABLE' || m.type === 'SCORECARD') && (
                    <Button type="link" size="small" style={{ fontSize: 10, padding: '0 4px', color: '#2563eb' }}
                      onClick={() => openInlineEditor(i, m)}>
                      Open ↗
                    </Button>
                  )}
                </div>
              );
            })
        }
      </div>
      <Handle type="source" position={Position.Right} id="next"
        style={{ background: '#ea580c', width: 10, height: 10 }} />

      <Modal title={`Edit Model Set: ${data.label}`} open={editing} onOk={save}
        onCancel={() => setEditing(false)} width={560}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {localModels.map((m, i) => (
            <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
              <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text strong style={{ fontSize: 12 }}>Model {i + 1}</Text>
                <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeModel(i)} />
              </Space>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>Name</Text>
                    <Input size="small" value={m.name}
                      onChange={e => updateModel(i, { name: e.target.value })}
                      style={{ marginTop: 4 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>Type</Text>
                    <Select size="small" value={m.type}
                      onChange={v => updateModel(i, { type: v as ModelType })}
                      style={{ marginTop: 4, width: '100%' }}
                      options={[
                        { value: 'EXPRESSION',     label: 'Expression' },
                        { value: 'SCORECARD',      label: 'Scorecard' },
                        { value: 'DECISION_TABLE', label: 'Decision Table' },
                      ]} />
                  </div>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>Result Key (stored in context as)</Text>
                  <Input size="small" value={m.resultKey || ''}
                    onChange={e => updateModel(i, { resultKey: e.target.value })}
                    placeholder={m.name || 'e.g. dpd_score'}
                    style={{ marginTop: 4 }} />
                </div>
                {m.type === 'EXPRESSION' && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 11 }}>Expression</Text>
                    <Input.TextArea size="small" value={m.expression || ''} rows={2}
                      onChange={e => updateModel(i, { expression: e.target.value })}
                      placeholder="e.g. input.emi / input.net_income"
                      style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }} />
                  </div>
                )}
                {(m.type === 'SCORECARD' || m.type === 'DECISION_TABLE') && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                    background: '#eff6ff', borderRadius: 6, border: '1px solid #bfdbfe',
                  }}>
                    <TableOutlined style={{ color: '#2563eb' }} />
                    <Text style={{ fontSize: 11, flex: 1, color: '#1e40af' }}>
                      {m.inlineDefinition
                        ? `${m.type === 'DECISION_TABLE'
                            ? `${(m.inlineDefinition as { rows?: unknown[] }).rows?.length ?? 0} rows defined`
                            : `${(m.inlineDefinition as { variables?: unknown[] }).variables?.length ?? 0} variables defined`}`
                        : 'Not configured yet'}
                    </Text>
                    <Button size="small" type="primary" ghost
                      onClick={() => openInlineEditor(i, { ...m, ...localModels[i] })}>
                      Open Editor ↗
                    </Button>
                  </div>
                )}
              </Space>
            </div>
          ))}
          <Button size="small" icon={<PlusOutlined />} onClick={addModel} style={{ width: '100%' }}>
            Add Model
          </Button>
        </Space>
      </Modal>
    </div>
  );
}

// ── OUTCOME node ──────────────────────────────────────────────────────────────

const OUTCOME_COLORS: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  APPROVED:    { color: '#16a34a', bg: '#f0fdf4', icon: <CheckCircleOutlined /> },
  REJECTED:    { color: '#dc2626', bg: '#fef2f2', icon: <CloseCircleOutlined /> },
  CANT_DECIDE: { color: '#d97706', bg: '#fffbeb', icon: <QuestionCircleOutlined /> },
};

function OutcomeNode({ data }: NodeProps) {
  const cfg: OutcomeNodeConfig = (data.config as OutcomeNodeConfig) || { outcome: '' };
  const style = OUTCOME_COLORS[cfg.outcome] || { color: '#6b7280', bg: '#f9fafb', icon: <ApartmentOutlined /> };
  return (
    <div style={{ ...nodeCard, minWidth: 130 }}>
      <Handle type="target" position={Position.Left} id="input"
        style={{ background: '#9ca3af', width: 10, height: 10 }} />
      <div style={nodeHeader(style.color, style.bg)}>
        {style.icon}
        <span>{cfg.outcome || data.label || 'Outcome'}</span>
      </div>
    </div>
  );
}

// ── Inline editors ────────────────────────────────────────────────────────────

function InlineRuleEditor({ rules, onChange }: { rules: GraphRule[]; onChange: (r: GraphRule[]) => void }) {
  const add = () => onChange([...rules, { name: `rule_${rules.length + 1}`, expression: '', priority: rules.length + 1, onMissing: 'FAIL' }]);
  const update = (i: number, field: keyof GraphRule, val: string | number) => {
    const copy = [...rules]; (copy[i] as unknown as Record<string, unknown>)[field] = val; onChange(copy);
  };
  const remove = (i: number) => onChange(rules.filter((_, idx) => idx !== i));

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      {rules.map((r, i) => (
        <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text strong style={{ fontSize: 12 }}>Rule {i + 1}</Text>
            <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => remove(i)} />
          </Space>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>Name</Text>
              <Input size="small" value={r.name} onChange={e => update(i, 'name', e.target.value)} style={{ marginTop: 4 }} />
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>Expression</Text>
              <Input.TextArea size="small" value={r.expression} rows={2}
                onChange={e => update(i, 'expression', e.target.value)}
                style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }} />
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Can't Decide Expression{' '}
                <Text type="secondary" style={{ fontSize: 10 }}>(if main fails and this is true → Can't Decide)</Text>
              </Text>
              <Input.TextArea size="small" value={r.cantDecideExpression || ''} rows={2}
                onChange={e => update(i, 'cantDecideExpression', e.target.value)}
                placeholder="e.g. bureau.score == nil"
                style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }} />
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>On Missing</Text>
              <Select size="small" value={r.onMissing || 'FAIL'} onChange={v => update(i, 'onMissing', v)}
                style={{ marginTop: 4, width: '100%' }}
                options={[{ value: 'FAIL', label: 'Fail' }, { value: 'PASS', label: 'Pass' }, { value: 'SKIP', label: 'Skip' }]} />
            </div>
          </Space>
        </div>
      ))}
      <Button size="small" icon={<PlusOutlined />} onClick={add} style={{ width: '100%' }}>
        Add Rule
      </Button>
    </Space>
  );
}

function InlineConditionEditor({ conditions, onChange }: { conditions: BranchCondition[]; onChange: (c: BranchCondition[]) => void }) {
  const add = () => {
    const id = `condition${conditions.length + 1}`;
    onChange([...conditions, { id, expression: '', label: `Condition ${conditions.length + 1}` }]);
  };
  const update = (i: number, field: keyof BranchCondition, val: string) => {
    const copy = [...conditions]; (copy[i] as unknown as Record<string, unknown>)[field] = val; onChange(copy);
  };
  const remove = (i: number) => onChange(conditions.filter((_, idx) => idx !== i));

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      {conditions.map((c, i) => (
        <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text strong style={{ fontSize: 12 }}>Condition {i + 1}</Text>
            <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => remove(i)} />
          </Space>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>Label (shown on handle)</Text>
              <Input size="small" value={c.label || ''} onChange={e => update(i, 'label', e.target.value)} style={{ marginTop: 4 }} />
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>Expression</Text>
              <Input.TextArea size="small" value={c.expression} rows={2}
                onChange={e => update(i, 'expression', e.target.value)}
                style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }} />
            </div>
          </Space>
        </div>
      ))}
      <Button size="small" icon={<PlusOutlined />} onClick={add} style={{ width: '100%' }}>
        Add Condition
      </Button>
    </Space>
  );
}

// ── Node type registry ────────────────────────────────────────────────────────

const NODE_TYPES = {
  START:    StartNode,
  RULE:     RuleNode,
  BRANCH:   BranchNode,
  SOURCE:   SourceNode,
  WORKFLOW: WorkflowNode,
  MODEL:    ModelNode,
  OUTCOME:  OutcomeNode,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9); }

function makeNode(type: string, position: { x: number; y: number }, extra?: Record<string, unknown>): Node {
  const id = `${type.toLowerCase()}_${uid()}`;
  const defaults: Record<string, unknown> = {};
  if (type === 'START')    defaults.label = 'START';
  if (type === 'RULE')     defaults.label = 'Rule Node';
  if (type === 'BRANCH')   defaults.label = 'Branch';
  if (type === 'SOURCE')   defaults.label = 'Source';
  if (type === 'WORKFLOW') defaults.label = 'Workflow';
  if (type === 'MODEL')    defaults.label = 'Model Set';
  if (type === 'OUTCOME')  defaults.label = extra?.outcome || 'Outcome';
  return { id, type, position, data: { ...defaults, config: extra || {} } };
}

function rfNodesToPolicy(nodes: Node[], edges: Edge[]): { policyNodes: PolicyNode[]; policyEdges: PolicyEdge[] } {
  const policyNodes: PolicyNode[] = nodes.map(n => ({
    id: n.id,
    type: n.type as PolicyNode['type'],
    name: n.data.label,
    position: n.position,
    config: n.data.config || {},
  }));
  const policyEdges: PolicyEdge[] = edges.map(e => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle || 'next',
    target: e.target,
  }));
  return { policyNodes, policyEdges };
}


// ── Policy metadata modal ─────────────────────────────────────────────────────

interface MetaModalProps {
  open: boolean;
  initial?: Partial<PolicyMeta>;
  locked?: boolean;
  onOk: (meta: PolicyMeta) => void;
  onCancel: () => void;
}
interface PolicyMeta {
  policyId: string; version: string; name: string;
  description: string; createdBy: string;
}

function PolicyMetaModal({ open, initial, locked, onOk, onCancel }: MetaModalProps) {
  const [meta, setMeta] = useState<PolicyMeta>({
    policyId: '', version: '1.0', name: '', description: '', createdBy: '',
    ...initial,
  });
  useEffect(() => {
    if (open) setMeta(m => ({ ...m, ...initial }));
  }, [open]);
  const set = (k: keyof PolicyMeta) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setMeta(m => ({ ...m, [k]: e.target.value }));
  return (
    <Modal title="Policy Details" open={open} onOk={() => onOk(meta)} onCancel={onCancel}
      okText="Open Editor" width={420}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>Policy ID *</Text>
          <Input value={meta.policyId} onChange={set('policyId')} disabled={locked}
            placeholder="e.g. loan-approval" style={{ marginTop: 4 }} />
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>Version *</Text>
          <Input value={meta.version} onChange={set('version')} disabled={locked}
            placeholder="1.0" style={{ marginTop: 4 }} />
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>Display Name</Text>
          <Input value={meta.name} onChange={set('name')}
            placeholder="Loan Approval Policy" style={{ marginTop: 4 }} />
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>Description</Text>
          <Input value={meta.description} onChange={set('description')}
            placeholder="Optional" style={{ marginTop: 4 }} />
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>Created By</Text>
          <Input value={meta.createdBy} onChange={set('createdBy')}
            placeholder="Optional" style={{ marginTop: 4 }} />
        </div>
      </Space>
    </Modal>
  );
}

// ── Edit mode state (from PolicyDetail) ───────────────────────────────────────

export interface EditorState {
  mode: 'new' | 'editDraft' | 'newVersion';
  meta: PolicyMeta;
  originalPolicyId?: string;
  originalVersion?: string;
  nodes: Node[];
  edges: Edge[];
}

// ── Main editor ───────────────────────────────────────────────────────────────

export default function PolicyEditor() {
  const navigate = useNavigate();
  const location = useLocation();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const incomingState = location.state as EditorState | null;

  const [metaOpen, setMetaOpen] = useState(!incomingState);
  const [meta, setMeta] = useState<PolicyMeta>(
    incomingState?.meta || { policyId: '', version: '1.0', name: '', description: '', createdBy: '' }
  );
  const [editorMode] = useState<'new' | 'editDraft' | 'newVersion'>(
    incomingState?.mode || 'new'
  );
  const [originalPolicyId] = useState(incomingState?.originalPolicyId);
  const [originalVersion] = useState(incomingState?.originalVersion);

  const initialNodes: Node[] = incomingState?.nodes || [
    { id: 'start', type: 'START', position: { x: 80, y: 200 }, data: { label: 'START' } },
  ];
  const initialEdges: Edge[] = incomingState?.edges || [];

  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [saving, setSaving] = useState(false);

  // Keep node data callbacks in sync
  const onConfigChange = useCallback((id: string, cfg: Record<string, unknown>) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, config: cfg } } : n));
  }, []);

  const onWorkflowOutcomesChange = useCallback((id: string, outcomes: string[]) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, workflowOutcomes: outcomes } } : n));
  }, []);

  const onOpenModelEditor = useCallback((nodeId: string, modelIndex: number, model: ModelEntry) => {
    const route = model.type === 'SCORECARD' ? '/editor/scorecard' : '/editor/decision-table';
    // Strip non-serializable callback functions from node data before passing to navigate
    // (history.pushState requires structured-cloneable state)
    const serializableNodes = nodes.map(n => ({
      ...n,
      data: {
        label: n.data.label,
        config: n.data.config,
        workflowOutcomes: n.data.workflowOutcomes,
      },
    }));
    navigate(route, {
      state: {
        nodeId,
        modelIndex,
        model,
        returnState: {
          mode: editorMode,
          meta,
          originalPolicyId,
          originalVersion,
          nodes: serializableNodes,
          edges,
        } as EditorState,
      },
    });
  }, [nodes, edges, editorMode, meta, originalPolicyId, originalVersion, navigate]);

  // Attach callbacks to all nodes that need them
  const nodesWithCallbacks = nodes.map(n => ({
    ...n,
    data: { ...n.data, onConfigChange, onWorkflowOutcomesChange },
  }));

  const onNodesChange = useCallback((changes: NodeChange[]) =>
    setNodes(nds => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) =>
    setEdges(eds => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((connection: Connection) =>
    setEdges(eds => addEdge({
      ...connection,
      id: `e_${uid()}`,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
    }, eds)), []);

  // ── Drag from palette ─────────────────────────────────────────────────────

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const typeData = e.dataTransfer.getData('application/reactflow');
    if (!typeData) return;
    const { nodeType, extra } = JSON.parse(typeData) as { nodeType: string; extra?: Record<string, unknown> };

    const bounds = reactFlowWrapper.current?.getBoundingClientRect();
    if (!bounds) return;

    // Get position relative to canvas - we need the reactflow instance for projection
    // Use a simple offset calculation
    const position = {
      x: e.clientX - bounds.left - 110,
      y: e.clientY - bounds.top - 30,
    };

    const newNode = makeNode(nodeType, position, extra);
    newNode.data = { ...newNode.data, onConfigChange, onWorkflowOutcomesChange };
    setNodes(nds => [...nds, newNode]);
  }, [onConfigChange, onWorkflowOutcomesChange]);

  // ── Delete selected nodes/edges ───────────────────────────────────────────

  const deleteSelected = useCallback(() => {
    setNodes(nds => nds.filter(n => !n.selected || n.type === 'START'));
    setEdges(eds => eds.filter(e => !e.selected));
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!meta.policyId || !meta.version) {
      message.error('Policy ID and Version are required');
      return;
    }
    const { policyNodes, policyEdges } = rfNodesToPolicy(nodes, edges);
    const req: SavePolicyRequest = {
      description: meta.description || undefined,
      createdBy: meta.createdBy || undefined,
      policy: {
        id: meta.policyId,
        version: meta.version,
        name: meta.name || meta.policyId,
        type: 'RULE_CHAIN',
        nodes: policyNodes,
        edges: policyEdges,
      },
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
      navigate('/');
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const pageTitle = editorMode === 'editDraft'
    ? `Edit Draft — ${meta.policyId} v${meta.version}`
    : editorMode === 'newVersion'
    ? `New Version — ${meta.policyId} v${meta.version}`
    : meta.policyId ? `${meta.policyId} v${meta.version}` : 'New Policy';

  return (
    <ModelEditorContext.Provider value={{ openModelEditor: onOpenModelEditor }}>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8fafc' }}>

      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <div style={{
        height: 52, background: '#0f172a', display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: 16, flexShrink: 0, borderBottom: '1px solid #1e293b',
      }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}
          style={{ color: '#94a3b8' }} />
        <div style={{ flex: 1 }}>
          <Text style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 14 }}>{pageTitle}</Text>
          <Tag color={editorMode === 'editDraft' ? 'orange' : 'blue'}
            style={{ marginLeft: 10, fontSize: 11 }}>
            {editorMode === 'editDraft' ? 'EDIT DRAFT' : 'DRAFT'}
          </Tag>
        </div>
        <Button icon={<SaveOutlined />} type="primary" loading={saving} onClick={handleSave}>
          {editorMode === 'editDraft' ? 'Save Draft' : 'Save Policy'}
        </Button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Left palette ────────────────────────────────────────── */}
        <div style={{
          width: 180, background: '#fff', borderRight: '1px solid #e2e8f0',
          padding: 12, overflowY: 'auto', flexShrink: 0,
        }}>
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
            Blocks
          </Text>
          <div style={{ marginTop: 8, marginBottom: 16 }}>
            {PALETTE_BLOCKS.map(b => (
              <PaletteItem key={b.type} nodeType={b.type} label={b.label}
                icon={b.icon} color={b.color} bg={b.bg} />
            ))}
          </div>
          <Divider style={{ margin: '8px 0' }} />
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
            Outcomes
          </Text>
          <div style={{ marginTop: 8 }}>
            {PALETTE_OUTCOMES.map(o => (
              <PaletteItem key={o.label} nodeType={o.type} label={o.label}
                icon={o.outcome === 'APPROVED' ? <CheckCircleOutlined /> :
                      o.outcome === 'REJECTED' ? <CloseCircleOutlined /> :
                      o.outcome === 'CANT_DECIDE' ? <QuestionCircleOutlined /> :
                      <ApartmentOutlined />}
                color={o.color} bg={o.bg}
                extra={{ outcome: o.outcome || '' }} />
            ))}
          </div>
          <Divider style={{ margin: '8px 0' }} />
          <Text type="secondary" style={{ fontSize: 10, color: '#94a3b8' }}>
            Drag blocks onto the canvas to build your policy flow.
          </Text>
        </div>

        {/* ── Canvas ──────────────────────────────────────────────── */}
        <div ref={reactFlowWrapper} style={{ flex: 1, position: 'relative' }}>
          <ReactFlow
            nodes={nodesWithCallbacks}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={NODE_TYPES}
            fitView
            deleteKeyCode={null}
            defaultEdgeOptions={{
              markerEnd: { type: MarkerType.ArrowClosed },
              style: { stroke: '#94a3b8', strokeWidth: 1.5 },
            }}
          >
            <Background color="#e2e8f0" gap={20} />
            <Controls />
            <MiniMap nodeColor={n => {
              if (n.type === 'START')    return '#1d4ed8';
              if (n.type === 'RULE')     return '#7c3aed';
              if (n.type === 'BRANCH')   return '#d97706';
              if (n.type === 'OUTCOME')  return '#16a34a';
              if (n.type === 'WORKFLOW') return '#2563eb';
              if (n.type === 'MODEL')    return '#ea580c';
              return '#94a3b8';
            }} />
            <Panel position="top-right">
              <Space>
                <Tooltip title="Delete selected nodes/edges (select then click)">
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={deleteSelected}>
                    Delete Selected
                  </Button>
                </Tooltip>
              </Space>
            </Panel>
          </ReactFlow>
        </div>
      </div>

      {/* ── Policy metadata modal (new policy) ──────────────────────── */}
      <PolicyMetaModal
        open={metaOpen}
        initial={meta}
        locked={editorMode === 'editDraft'}
        onOk={m => { setMeta(m); setMetaOpen(false); }}
        onCancel={() => navigate('/')}
      />
    </div>
    </ModelEditorContext.Provider>
  );
}

// ── Palette item ──────────────────────────────────────────────────────────────

function PaletteItem({
  nodeType, label, icon, color, bg, extra,
}: {
  nodeType: string; label: string; icon: React.ReactNode;
  color: string; bg: string; extra?: Record<string, unknown>;
}) {
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/reactflow', JSON.stringify({ nodeType, extra }));
    e.dataTransfer.effectAllowed = 'move';
  };
  return (
    <div
      draggable
      onDragStart={onDragStart}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px', borderRadius: 8, marginBottom: 4,
        background: bg, border: `1px solid ${color}30`,
        cursor: 'grab', color, fontSize: 12, fontWeight: 500,
        userSelect: 'none',
      }}
    >
      {icon} {label}
    </div>
  );
}
