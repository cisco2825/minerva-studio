import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Input, Select, Typography, InputNumber, Tag, Divider, message } from 'antd';
import {
  ArrowLeftOutlined, PlusOutlined, DeleteOutlined, SaveOutlined,
} from '@ant-design/icons';
import type {
  ScorecardDefinition, ScorecardVariableConfig, ScoreBand,
  ScoreThreshold, OnMissing, Operator, ModelEntry,
} from '../types';
import type { EditorState } from './PolicyEditor';

const { Text } = Typography;

const BAND_OPERATORS: { value: Operator; label: string }[] = [
  { value: 'eq',  label: '=' },
  { value: 'neq', label: '≠' },
  { value: 'gt',  label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt',  label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'bt',  label: 'between' },
  { value: 'in',  label: 'in list' },
];

function emptyBand(): ScoreBand {
  return { operator: 'gte', value: 0, points: 0, label: '' };
}

function emptyVariable(index: number): ScorecardVariableConfig {
  return {
    name: `variable_${index}`,
    param: '',
    bands: [emptyBand()],
    defaultPoints: 0,
    onMissing: 'SKIP',
  };
}

// ── Band row ──────────────────────────────────────────────────────────────────

function BandRow({
  band, onUpdate, onDelete,
}: {
  band: ScoreBand;
  onUpdate: (b: ScoreBand) => void;
  onDelete: () => void;
}) {
  const isBetween = band.operator === 'bt';
  const isList = band.operator === 'in';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 10px', background: '#fafafa',
      border: '1px solid #f1f5f9', borderRadius: 6, marginBottom: 4,
    }}>
      <Select
        size="small"
        value={band.operator}
        onChange={v => onUpdate({ ...band, operator: v as Operator, value: 0, values: [] })}
        style={{ width: 90 }}
        options={BAND_OPERATORS}
      />

      {isBetween ? (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <InputNumber size="small" value={band.values?.[0] as number ?? 0} style={{ width: 70 }}
            onChange={v => onUpdate({ ...band, values: [v ?? 0, band.values?.[1] ?? 0] })} />
          <Text type="secondary" style={{ fontSize: 10 }}>to</Text>
          <InputNumber size="small" value={band.values?.[1] as number ?? 0} style={{ width: 70 }}
            onChange={v => onUpdate({ ...band, values: [band.values?.[0] ?? 0, v ?? 0] })} />
        </div>
      ) : isList ? (
        <Input size="small" placeholder="a, b, c" style={{ width: 140, fontFamily: 'monospace', fontSize: 11 }}
          value={Array.isArray(band.values) ? band.values.join(', ') : ''}
          onChange={e => onUpdate({ ...band, values: e.target.value.split(',').map(s => s.trim()) })} />
      ) : (
        <InputNumber size="small" value={band.value as number ?? 0} style={{ width: 100 }}
          onChange={v => onUpdate({ ...band, value: v ?? 0 })} />
      )}

      <Text type="secondary" style={{ fontSize: 11 }}>→</Text>

      <InputNumber
        size="small"
        prefix="pts:"
        value={band.points}
        onChange={v => onUpdate({ ...band, points: v ?? 0 })}
        style={{ width: 100 }}
      />

      <Input
        size="small"
        value={band.label || ''}
        onChange={e => onUpdate({ ...band, label: e.target.value })}
        placeholder="label (optional)"
        style={{ width: 120 }}
      />

      <Button type="text" danger size="small" icon={<DeleteOutlined />}
        onClick={onDelete} style={{ padding: '0 4px', marginLeft: 'auto' }} />
    </div>
  );
}

// ── Variable card ─────────────────────────────────────────────────────────────

function VariableCard({
  variable, index, onUpdate, onDelete,
}: {
  variable: ScorecardVariableConfig;
  index: number;
  onUpdate: (v: ScorecardVariableConfig) => void;
  onDelete: () => void;
}) {
  const updateBand = (i: number, band: ScoreBand) => {
    const bands = [...variable.bands];
    bands[i] = band;
    onUpdate({ ...variable, bands });
  };

  const addBand = () => onUpdate({ ...variable, bands: [...variable.bands, emptyBand()] });
  const removeBand = (i: number) => onUpdate({ ...variable, bands: variable.bands.filter((_, idx) => idx !== i) });

  return (
    <div style={{
      border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 16,
      background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Tag color="purple" style={{ fontSize: 11 }}>Variable {index + 1}</Tag>
        <div style={{ flex: 1, display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Name</Text>
            <Input size="small" value={variable.name}
              onChange={e => onUpdate({ ...variable, name: e.target.value })}
              style={{ marginTop: 2 }} />
          </div>
          <div style={{ flex: 1 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Context Path</Text>
            <Input size="small" value={variable.param}
              onChange={e => onUpdate({ ...variable, param: e.target.value })}
              placeholder="e.g. bureau.credit_score"
              style={{ marginTop: 2, fontFamily: 'monospace', fontSize: 11 }} />
          </div>
          <div style={{ width: 100 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>Default Pts</Text>
            <InputNumber size="small" value={variable.defaultPoints ?? 0}
              onChange={v => onUpdate({ ...variable, defaultPoints: v ?? 0 })}
              style={{ width: '100%', marginTop: 2 }} />
          </div>
          <div style={{ width: 90 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>On Missing</Text>
            <Select size="small" value={variable.onMissing || 'SKIP'}
              onChange={v => onUpdate({ ...variable, onMissing: v as OnMissing })}
              style={{ width: '100%', marginTop: 2 }}
              options={[
                { value: 'SKIP', label: 'Skip' },
                { value: 'PASS', label: 'Default' },
                { value: 'FAIL', label: 'Fail' },
              ]} />
          </div>
        </div>
        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={onDelete} />
      </div>

      {/* Bands */}
      <div>
        <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Bands
        </Text>
        <div style={{ marginTop: 6 }}>
          {variable.bands.map((band, i) => (
            <BandRow key={i} band={band}
              onUpdate={b => updateBand(i, b)}
              onDelete={() => removeBand(i)} />
          ))}
        </div>
        <Button size="small" icon={<PlusOutlined />} onClick={addBand} style={{ marginTop: 4 }}>
          Add Band
        </Button>
      </div>
    </div>
  );
}

// ── Threshold section ─────────────────────────────────────────────────────────

function ThresholdSection({
  thresholds, defaultOutcome, onChange, onDefaultChange,
}: {
  thresholds: ScoreThreshold[];
  defaultOutcome: string;
  onChange: (t: ScoreThreshold[]) => void;
  onDefaultChange: (s: string) => void;
}) {
  const add = () => onChange([...thresholds, { min: 0, max: 100, outcome: '', label: '' }]);
  const remove = (i: number) => onChange(thresholds.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<ScoreThreshold>) => {
    const copy = [...thresholds];
    copy[i] = { ...copy[i], ...patch };
    onChange(copy);
  };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <Text style={{ fontWeight: 600, fontSize: 13 }}>Score → Outcome Mapping</Text>
      <div style={{ marginTop: 12 }}>
        {thresholds.map((t, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
            padding: '6px 10px', background: '#fafafa', borderRadius: 6, border: '1px solid #f1f5f9',
          }}>
            <Text style={{ fontSize: 11, color: '#64748b', width: 40 }}>Score</Text>
            <InputNumber size="small" value={t.min} style={{ width: 70 }} placeholder="min"
              onChange={v => update(i, { min: v ?? 0 })} />
            <Text type="secondary" style={{ fontSize: 11 }}>–</Text>
            <InputNumber size="small" value={t.max} style={{ width: 70 }} placeholder="max"
              onChange={v => update(i, { max: v ?? 0 })} />
            <Text style={{ fontSize: 11, color: '#64748b' }}>→</Text>
            <Input size="small" value={t.outcome} placeholder="APPROVED"
              onChange={e => update(i, { outcome: e.target.value })}
              style={{ width: 110, fontFamily: 'monospace', fontSize: 11 }} />
            <Input size="small" value={t.label || ''} placeholder="label"
              onChange={e => update(i, { label: e.target.value })}
              style={{ width: 100, fontSize: 11 }} />
            <Button type="text" danger size="small" icon={<DeleteOutlined />}
              onClick={() => remove(i)} style={{ padding: '0 4px', marginLeft: 'auto' }} />
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <Button size="small" icon={<PlusOutlined />} onClick={add}>Add Threshold</Button>
          <Text type="secondary" style={{ fontSize: 11 }}>Default outcome:</Text>
          <Input size="small" value={defaultOutcome}
            onChange={e => onDefaultChange(e.target.value)}
            placeholder="CANT_DECIDE" style={{ width: 130, fontFamily: 'monospace', fontSize: 11 }} />
        </div>
      </div>
    </div>
  );
}

// ── Main editor ───────────────────────────────────────────────────────────────

interface ScEditorLocationState {
  nodeId: string;
  modelIndex: number;
  model: ModelEntry;
  returnState: EditorState;
}

export default function ScorecardEditor() {
  const navigate = useNavigate();
  const location = useLocation();
  const { nodeId, modelIndex, model, returnState } = location.state as ScEditorLocationState;

  const existingDef = model.inlineDefinition as ScorecardDefinition | undefined;

  const [variables, setVariables] = useState<ScorecardVariableConfig[]>(
    existingDef?.variables ?? [emptyVariable(1)]
  );
  const [thresholds, setThresholds] = useState<ScoreThreshold[]>(
    existingDef?.thresholds ?? []
  );
  const [defaultOutcome, setDefaultOutcome] = useState(existingDef?.defaultOutcome ?? 'CANT_DECIDE');

  const addVariable = () => setVariables([...variables, emptyVariable(variables.length + 1)]);
  const updateVariable = (i: number, v: ScorecardVariableConfig) => {
    const copy = [...variables];
    copy[i] = v;
    setVariables(copy);
  };
  const removeVariable = (i: number) => setVariables(variables.filter((_, idx) => idx !== i));

  const handleSave = () => {
    if (variables.length === 0) { message.error('Add at least one variable'); return; }

    const definition: ScorecardDefinition = { variables, thresholds, defaultOutcome };

    const updatedNodes = returnState.nodes.map(n => {
      if (n.id !== nodeId) return n;
      const cfg = (n.data.config || { models: [] }) as { models: ModelEntry[] };
      const models = [...(cfg.models || [])];
      models[modelIndex] = { ...models[modelIndex], inlineDefinition: definition };
      return { ...n, data: { ...n.data, config: { models } } };
    });

    navigate('/policies/new', { state: { ...returnState, nodes: updatedNodes } });
  };

  // Compute score range preview
  const maxPossible = variables.reduce((sum, v) => {
    const maxBand = v.bands.reduce((m, b) => Math.max(m, b.points), 0);
    return sum + maxBand;
  }, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f8fafc' }}>

      {/* Top bar */}
      <div style={{
        height: 52, background: '#0f172a', display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: 12, flexShrink: 0, borderBottom: '1px solid #1e293b',
      }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}
          style={{ color: '#94a3b8' }} />
        <Text style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 14 }}>
          {model.name} — Scorecard
        </Text>
        <Tag color="purple" style={{ fontSize: 11 }}>Max score: {maxPossible}</Tag>
        <div style={{ flex: 1 }} />
        <Button icon={<SaveOutlined />} type="primary" size="small" onClick={handleSave}>
          Save
        </Button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>

          {/* Variables */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontWeight: 600, fontSize: 15 }}>Variables</Text>
            <Button icon={<PlusOutlined />} onClick={addVariable} type="dashed">
              Add Variable
            </Button>
          </div>

          {variables.map((v, i) => (
            <VariableCard key={i} variable={v} index={i}
              onUpdate={updated => updateVariable(i, updated)}
              onDelete={() => removeVariable(i)} />
          ))}

          <Divider />

          {/* Thresholds */}
          <ThresholdSection
            thresholds={thresholds}
            defaultOutcome={defaultOutcome}
            onChange={setThresholds}
            onDefaultChange={setDefaultOutcome}
          />
        </div>
      </div>
    </div>
  );
}
