import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Input, Select, Typography, Space, Tooltip, Dropdown, message } from 'antd';
import {
  ArrowLeftOutlined, PlusOutlined, DeleteOutlined, SaveOutlined, DownOutlined,
} from '@ant-design/icons';
import type {
  DecisionTableDefinition, DtInputColumn, DtOutputColumn, DtCellCondition,
  DtRow, DataType, HitPolicy, Operator, ModelEntry,
} from '../types';
import type { EditorState } from './PolicyEditor';

const { Text } = Typography;

// ── Operator options by datatype ──────────────────────────────────────────────

const OPERATORS_BY_TYPE: Record<DataType, { value: Operator; label: string }[]> = {
  NUMBER: [
    { value: 'eq',  label: '=' },
    { value: 'neq', label: '≠' },
    { value: 'gt',  label: '>' },
    { value: 'gte', label: '≥' },
    { value: 'lt',  label: '<' },
    { value: 'lte', label: '≤' },
    { value: 'bt',  label: 'between' },
    { value: 'in',  label: 'in list' },
  ],
  TEXT: [
    { value: 'eq',     label: '=' },
    { value: 'neq',    label: '≠' },
    { value: 'in',     label: 'in list' },
    { value: 'notIn',  label: 'not in list' },
  ],
  DATE: [
    { value: 'eq',  label: '=' },
    { value: 'gt',  label: 'after' },
    { value: 'lt',  label: 'before' },
    { value: 'gte', label: 'on or after' },
    { value: 'lte', label: 'on or before' },
    { value: 'bt',  label: 'between' },
  ],
  BOOLEAN: [
    { value: 'eq',  label: '=' },
    { value: 'neq', label: '≠' },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell(type: 'ANY' | 'CONDITION' = 'CONDITION'): DtCellCondition {
  return { type, operator: 'eq', value: '', values: [] };
}

function emptyRow(numInputs: number, priority: number): DtRow {
  return {
    priority,
    conditions: Array.from({ length: numInputs }, () => emptyCell()),
    output: '',
  };
}

// ── Cell editor ───────────────────────────────────────────────────────────────

function CellEditor({
  cell, datatype, onChange,
}: {
  cell: DtCellCondition;
  datatype: DataType;
  onChange: (c: DtCellCondition) => void;
}) {
  const ops = OPERATORS_BY_TYPE[datatype] || OPERATORS_BY_TYPE.TEXT;
  const isBetween = cell.operator === 'bt';
  const isList = cell.operator === 'in' || cell.operator === 'notIn';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        <Select
          size="small"
          value={cell.type}
          onChange={v => onChange({ ...cell, type: v as 'ANY' | 'CONDITION' })}
          style={{ width: 60 }}
          options={[{ value: 'ANY', label: 'Any' }, { value: 'CONDITION', label: 'If' }]}
        />
        {cell.type === 'CONDITION' && (
          <Select
            size="small"
            value={cell.operator || 'eq'}
            onChange={v => onChange({ ...cell, operator: v as Operator, value: '', values: [] })}
            style={{ width: 90 }}
            options={ops}
          />
        )}
      </div>
      {cell.type === 'CONDITION' && (
        isBetween ? (
          <div style={{ display: 'flex', gap: 3 }}>
            <Input size="small" placeholder="min"
              value={cell.values?.[0] as string ?? ''}
              onChange={e => onChange({ ...cell, values: [e.target.value, cell.values?.[1] ?? ''] })}
              style={{ width: 64, fontFamily: 'monospace', fontSize: 11 }} />
            <Input size="small" placeholder="max"
              value={cell.values?.[1] as string ?? ''}
              onChange={e => onChange({ ...cell, values: [cell.values?.[0] ?? '', e.target.value] })}
              style={{ width: 64, fontFamily: 'monospace', fontSize: 11 }} />
          </div>
        ) : isList ? (
          <Input size="small" placeholder="a, b, c"
            value={Array.isArray(cell.values) ? cell.values.join(', ') : ''}
            onChange={e => onChange({ ...cell, values: e.target.value.split(',').map(s => s.trim()) })}
            style={{ fontFamily: 'monospace', fontSize: 11 }} />
        ) : (
          <Input size="small" placeholder="value"
            value={cell.value as string ?? ''}
            onChange={e => onChange({ ...cell, value: e.target.value })}
            style={{ fontFamily: 'monospace', fontSize: 11 }} />
        )
      )}
    </div>
  );
}

// ── Column header ──────────────────────────────────────────────────────────────

function ColumnHeader({
  col, onUpdate, onDelete,
}: {
  col: DtInputColumn;
  onUpdate: (patch: Partial<DtInputColumn>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <th
      style={{
        background: '#f8fafc', padding: '6px 8px', borderBottom: '2px solid #e2e8f0',
        borderRight: '1px solid #e2e8f0', minWidth: 160, textAlign: 'left',
      }}
      onBlur={e => {
        // Close only when focus moves outside this entire <th>
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setEditing(false);
      }}
    >
      {editing ? (
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Input size="small" value={col.name} placeholder="Column name"
            onChange={e => onUpdate({ name: e.target.value })}
            autoFocus style={{ fontSize: 11 }} />
          <Input size="small" value={col.param} placeholder="context.path"
            onChange={e => onUpdate({ param: e.target.value })}
            style={{ fontFamily: 'monospace', fontSize: 11 }} />
          <Select size="small" value={col.datatype}
            onChange={v => onUpdate({ datatype: v as DataType })}
            style={{ width: '100%' }}
            options={[
              { value: 'NUMBER', label: 'Number' },
              { value: 'TEXT', label: 'Text' },
              { value: 'DATE', label: 'Date' },
              { value: 'BOOLEAN', label: 'Boolean' },
            ]} />
        </Space>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
          onClick={() => setEditing(true)}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{col.name || 'Unnamed'}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{col.param || 'click to set path'}</div>
            <div style={{ fontSize: 9, color: '#cbd5e1' }}>{col.datatype}</div>
          </div>
          <Button type="text" danger size="small" icon={<DeleteOutlined />}
            onClick={e => { e.stopPropagation(); onDelete(); }} style={{ padding: '0 2px' }} />
        </div>
      )}
    </th>
  );
}

// ── Output column header ───────────────────────────────────────────────────────

function OutputColumnHeader({
  col, onUpdate,
}: {
  col: DtOutputColumn;
  onUpdate: (patch: Partial<DtOutputColumn>) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <th
      style={{
        background: '#eff6ff', padding: '6px 8px', borderBottom: '2px solid #bfdbfe',
        minWidth: 140, textAlign: 'left',
      }}
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setEditing(false);
      }}
    >
      {editing ? (
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Input size="small" value={col.name} placeholder="Output name"
            onChange={e => onUpdate({ name: e.target.value })}
            autoFocus style={{ fontSize: 11 }} />
          <Select size="small" value={col.datatype}
            onChange={v => onUpdate({ datatype: v as DataType })}
            style={{ width: '100%' }}
            options={[
              { value: 'NUMBER', label: 'Number' },
              { value: 'TEXT', label: 'Text' },
              { value: 'DATE', label: 'Date' },
              { value: 'BOOLEAN', label: 'Boolean' },
            ]} />
        </Space>
      ) : (
        <div style={{ cursor: 'pointer' }} onClick={() => setEditing(true)}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af' }}>OUTPUT: {col.name || 'Unnamed'}</div>
          <div style={{ fontSize: 9, color: '#93c5fd' }}>{col.datatype}</div>
        </div>
      )}
    </th>
  );
}

// ── Main editor ───────────────────────────────────────────────────────────────

interface DtEditorLocationState {
  nodeId: string;
  modelIndex: number;
  model: ModelEntry;
  returnState: EditorState;
}

export default function DecisionTableEditor() {
  const navigate = useNavigate();
  const location = useLocation();
  const { nodeId, modelIndex, model, returnState } = location.state as DtEditorLocationState;

  const existingDef = model.inlineDefinition as DecisionTableDefinition | undefined;

  const [inputs, setInputs] = useState<DtInputColumn[]>(
    existingDef?.inputs ?? [{ name: 'New Predictor', param: '', datatype: 'NUMBER' }]
  );
  const [output, setOutput] = useState<DtOutputColumn>(
    existingDef?.output ?? { name: 'Output', datatype: 'NUMBER' }
  );
  const [hitPolicy, setHitPolicy] = useState<HitPolicy>(existingDef?.hitPolicy ?? 'FIRST');
  const [rows, setRows] = useState<DtRow[]>(
    existingDef?.rows ?? [emptyRow(existingDef?.inputs?.length ?? 1, 1)]
  );

  // ── Column management ───────────────────────────────────────────────────────

  const addPredictor = () => {
    const newCol: DtInputColumn = { name: `Predictor ${inputs.length + 1}`, param: '', datatype: 'NUMBER' };
    setInputs([...inputs, newCol]);
    setRows(rows.map(r => ({ ...r, conditions: [...r.conditions, emptyCell()] })));
  };

  const updatePredictor = (i: number, patch: Partial<DtInputColumn>) => {
    const copy = [...inputs];
    copy[i] = { ...copy[i], ...patch };
    setInputs(copy);
  };

  const deletePredictor = (i: number) => {
    setInputs(inputs.filter((_, idx) => idx !== i));
    setRows(rows.map(r => ({
      ...r,
      conditions: r.conditions.filter((_, idx) => idx !== i),
    })));
  };

  // ── Row management ──────────────────────────────────────────────────────────

  const addRow = () => {
    setRows([...rows, emptyRow(inputs.length, rows.length + 1)]);
  };

  const deleteRow = (i: number) => setRows(rows.filter((_, idx) => idx !== i));

  const updateCell = (rowIdx: number, colIdx: number, cell: DtCellCondition) => {
    const copy = rows.map(r => ({ ...r, conditions: [...r.conditions] }));
    copy[rowIdx].conditions[colIdx] = cell;
    setRows(copy);
  };

  const updateOutput = (rowIdx: number, val: string) => {
    const copy = [...rows];
    copy[rowIdx] = { ...copy[rowIdx], output: val };
    setRows(copy);
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = () => {
    if (!output.name) { message.error('Output column must have a name'); return; }

    const definition: DecisionTableDefinition = { inputs, output, hitPolicy, rows };

    const updatedNodes = returnState.nodes.map(n => {
      if (n.id !== nodeId) return n;
      const cfg = (n.data.config || { models: [] }) as { models: ModelEntry[] };
      const models = [...(cfg.models || [])];
      models[modelIndex] = { ...models[modelIndex], inlineDefinition: definition };
      return { ...n, data: { ...n.data, config: { models } } };
    });

    navigate('/policies/new', { state: { ...returnState, nodes: updatedNodes } });
  };

  const addColumnMenu = {
    items: [
      { key: 'predictor', label: 'Predictor', onClick: addPredictor },
      { key: 'output',    label: 'Output (rename existing)', onClick: () => {} },
    ],
  };

  // ── Render ──────────────────────────────────────────────────────────────────

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
          {model.name} — Decision Table
        </Text>
        <div style={{ flex: 1 }} />
        <Select size="small" value={hitPolicy} onChange={v => setHitPolicy(v as HitPolicy)}
          style={{ width: 100 }}
          options={[{ value: 'FIRST', label: 'First Hit' }, { value: 'UNIQUE', label: 'Unique Hit' }]} />
        <Dropdown menu={addColumnMenu} trigger={['click']}>
          <Button size="small" style={{ background: '#1e293b', color: '#94a3b8', borderColor: '#334155' }}>
            Add Column <DownOutlined />
          </Button>
        </Dropdown>
        <Button icon={<SaveOutlined />} type="primary" size="small" onClick={handleSave}>
          Save
        </Button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {rows.length === 0 && (
          <div style={{
            padding: '10px 16px', marginBottom: 16, background: '#fef3c7',
            border: '1px solid #fcd34d', borderRadius: 6, fontSize: 12, color: '#92400e',
          }}>
            Add valid rows to evaluate
          </div>
        )}

        <table style={{ borderCollapse: 'collapse', width: '100%', background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
          <thead>
            <tr>
              <th style={{ background: '#f8fafc', padding: '6px 8px', borderBottom: '2px solid #e2e8f0', borderRight: '1px solid #e2e8f0', width: 40, textAlign: 'center' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>#</Text>
              </th>
              {inputs.map((col, i) => (
                <ColumnHeader key={i} col={col}
                  onUpdate={patch => updatePredictor(i, patch)}
                  onDelete={() => deletePredictor(i)} />
              ))}
              <OutputColumnHeader col={output} onUpdate={patch => setOutput({ ...output, ...patch })} />
              <th style={{ background: '#f8fafc', width: 36, borderBottom: '2px solid #e2e8f0' }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px', textAlign: 'center', color: '#94a3b8', fontSize: 12, borderRight: '1px solid #f1f5f9' }}>
                  {ri + 1}
                </td>
                {row.conditions.map((cell, ci) => (
                  <td key={ci} style={{ padding: '6px 8px', verticalAlign: 'top', borderRight: '1px solid #f1f5f9' }}>
                    <CellEditor
                      cell={cell}
                      datatype={inputs[ci]?.datatype ?? 'NUMBER'}
                      onChange={c => updateCell(ri, ci, c)}
                    />
                  </td>
                ))}
                <td style={{ padding: '6px 8px', verticalAlign: 'top', background: '#f0f9ff' }}>
                  <Input size="small" value={row.output as string ?? ''}
                    onChange={e => updateOutput(ri, e.target.value)}
                    style={{ fontFamily: 'monospace', fontSize: 11 }}
                    placeholder="output value" />
                </td>
                <td style={{ padding: '4px', textAlign: 'center', verticalAlign: 'middle' }}>
                  <Tooltip title="Delete row">
                    <Button type="text" danger size="small" icon={<DeleteOutlined />}
                      onClick={() => deleteRow(ri)} style={{ padding: '0 4px' }} />
                  </Tooltip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <Button icon={<PlusOutlined />} style={{ marginTop: 12 }} onClick={addRow}>
          Add Row
        </Button>
      </div>
    </div>
  );
}
