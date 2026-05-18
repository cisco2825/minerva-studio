import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Tabs, Table, Tag, Button, Select, Space, Typography, Alert, Spin,
  Drawer, Input, Popconfirm, message, Divider, Badge,
} from 'antd';
import {
  ArrowLeftOutlined, PlayCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
  EditOutlined, CopyOutlined, DeleteOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  fetchVersions, updateStatus, evaluate,
  fetchEvaluations, fetchEvaluationDetail, fetchPolicyDefinition, deletePolicy,
} from '../api/client';
import type {
  PolicySummary, PolicyStatus, EvaluationLogSummary,
  EvaluationLogDetail, EvaluationResult, RuleResult,
  Policy, ScorecardBreakdownEntry,
} from '../types';
import type { EditorState } from './PolicyEditor';
import type { Node, Edge } from 'reactflow';
import { MarkerType } from 'reactflow';

const { Title, Text } = Typography;
const { TextArea } = Input;

const STATUS_COLORS: Record<PolicyStatus, string> = {
  DRAFT: 'default',
  ACTIVE: 'success',
  INACTIVE: 'warning',
  ARCHIVED: 'error',
};

const NEXT_ACTIONS: Record<PolicyStatus, { label: string; next: PolicyStatus; danger?: boolean }[]> = {
  DRAFT: [
    { label: 'Activate', next: 'ACTIVE' },
    { label: 'Archive', next: 'ARCHIVED', danger: true },
  ],
  ACTIVE: [{ label: 'Deactivate', next: 'INACTIVE', danger: true }],
  INACTIVE: [{ label: 'Archive', next: 'ARCHIVED', danger: true }],
  ARCHIVED: [],
};

// ── Edit helpers ─────────────────────────────────────────────────────────────

function bumpVersion(version: string): string {
  const parts = version.split('.');
  const last = parseInt(parts[parts.length - 1], 10);
  if (!isNaN(last)) { parts[parts.length - 1] = String(last + 1); return parts.join('.'); }
  return version + '.1';
}

function policyToEditorState(policy: Policy, summary: PolicySummary, mode: 'editDraft' | 'newVersion'): EditorState {
  const rfNodes: Node[] = (policy.nodes || []).map(n => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: { label: n.name || n.type, config: n.config || {} },
  }));
  const HANDLE_COLOR: Record<string, string> = {
    pass: '#16a34a', fail: '#ef4444', cantDecide: '#f59e0b',
    next: '#6366f1', default: '#94a3b8',
  };
  const rfEdges: Edge[] = (policy.edges || []).map(e => {
    const color = HANDLE_COLOR[e.sourceHandle || 'next'] ?? '#94a3b8';
    return {
      id: e.id,
      source: e.source,
      sourceHandle: e.sourceHandle,
      target: e.target,
      type: 'default',
      markerEnd: { type: MarkerType.ArrowClosed, color },
      style: { stroke: color, strokeWidth: 2 },
    };
  });
  if (rfNodes.length === 0) {
    rfNodes.push({ id: 'start', type: 'START', position: { x: 80, y: 200 }, data: { label: 'START' } });
  }
  return {
    mode,
    originalPolicyId: summary.policyId,
    originalVersion: summary.version,
    meta: {
      policyId: policy.id,
      version: mode === 'newVersion' ? bumpVersion(policy.version) : policy.version,
      name: policy.name || '',
      description: summary.description || '',
      createdBy: summary.createdBy || '',
    },
    nodes: rfNodes,
    edges: rfEdges,
  };
}

// ── Versions Tab ─────────────────────────────────────────────────────────────

function VersionsTab({ policyId }: { policyId: string }) {
  const navigate = useNavigate();
  const [versions, setVersions] = useState<PolicySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchVersions(policyId)
      .then(setVersions)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [policyId]);

  useEffect(() => { load(); }, [load]);

  const handleTransition = async (version: string, next: PolicyStatus) => {
    try {
      await updateStatus(policyId, version, next);
      message.success(`Version ${version} → ${next}`);
      load();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Failed');
    }
  };

  const openEditor = async (row: PolicySummary, mode: 'editDraft' | 'newVersion') => {
    setEditLoading(`${row.version}-${mode}`);
    try {
      const policy = await fetchPolicyDefinition(policyId, row.version);
      const state = policyToEditorState(policy, row, mode);
      navigate('/policies/new', { state });
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Failed to load policy definition');
    } finally {
      setEditLoading(null);
    }
  };

  const columns: ColumnsType<PolicySummary> = [
    {
      title: 'Version',
      dataIndex: 'version',
      render: (v: string) => <Text code>{v}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (s: PolicyStatus) => <Tag color={STATUS_COLORS[s]}>{s}</Tag>,
    },
    {
      title: 'Created By',
      dataIndex: 'createdBy',
      render: (v?: string) => <Text type="secondary">{v ?? '—'}</Text>,
    },
    {
      title: 'Created At',
      dataIndex: 'createdAt',
      render: (t: string) => <Text type="secondary">{new Date(t).toLocaleString()}</Text>,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, row: PolicySummary) => (
        <Space wrap>
          {row.status === 'DRAFT' && (
            <Button
              size="small" icon={<EditOutlined />}
              loading={editLoading === `${row.version}-editDraft`}
              onClick={() => openEditor(row, 'editDraft')}
            >
              Edit
            </Button>
          )}
          <Button
            size="small" icon={<CopyOutlined />}
            loading={editLoading === `${row.version}-newVersion`}
            onClick={() => openEditor(row, 'newVersion')}
          >
            New Version
          </Button>
          {NEXT_ACTIONS[row.status].map(({ label, next, danger }) => (
            <Popconfirm
              key={next}
              title={`Set version ${row.version} to ${next}?`}
              onConfirm={() => handleTransition(row.version, next)}
              okText="Yes" cancelText="No"
            >
              <Button size="small" danger={danger} type={danger ? 'default' : 'primary'}>
                {label}
              </Button>
            </Popconfirm>
          ))}
        </Space>
      ),
    },
  ];

  if (error) return <Alert type="error" message={error} showIcon />;

  return (
    <Spin spinning={loading}>
      <Table dataSource={versions} columns={columns} rowKey="id" pagination={false} size="middle" />
    </Spin>
  );
}

// ── Result Display ────────────────────────────────────────────────────────────

function ResultDisplay({ result }: { result: EvaluationResult }) {
  const isCustomOutput = result.customOutput !== undefined && result.customOutput !== null;

  const outcomeColor = isCustomOutput
    ? 'processing'
    : result.outcome === 'APPROVED' || result.outcome?.toLowerCase() === 'approved' || result.outcome === 'PASS'
    ? 'success'
    : result.outcome === 'REJECTED' || result.outcome?.toLowerCase() === 'rejected' || result.outcome === 'FAIL'
    ? 'error'
    : 'processing';

  const outcomeLabel = isCustomOutput ? 'Custom Output' : (result.outcome ?? 'No outcome');

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space align="center" size={16}>
        <Badge status={outcomeColor} />
        <Text strong style={{ fontSize: 20 }}>{outcomeLabel}</Text>
        <Text type="secondary">{result.evaluationMs}ms</Text>
      </Space>

      {result.triggeredBy && (
        <Text type="secondary">Triggered by: <Text code>{result.triggeredBy}</Text></Text>
      )}

      {/* ── Custom Output ── */}
      {isCustomOutput && (
        <>
          <Divider orientation="left" plain>Output</Divider>
          <pre style={{
            background: '#0f172a', color: '#e2e8f0',
            borderRadius: 8, padding: '12px 16px',
            fontSize: 12, lineHeight: 1.6,
            overflowX: 'auto', margin: 0,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          }}>
            {JSON.stringify(result.customOutput, null, 2)}
          </pre>
        </>
      )}

      {/* ── Standard output fields ── */}
      {!isCustomOutput && result.outputFields && Object.keys(result.outputFields).length > 0 && (
        <>
          <Divider orientation="left" plain>Output Fields</Divider>
          <Table
            dataSource={Object.entries(result.outputFields).map(([k, v]) => ({ key: k, value: v }))}
            rowKey="key"
            size="small"
            pagination={false}
            columns={[
              { title: 'Field', dataIndex: 'key',   render: (k: string) => <Text code>{k}</Text> },
              { title: 'Value', dataIndex: 'value', render: (v: unknown) =>
                  <Text>{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}</Text> },
            ]}
          />
        </>
      )}

      {result.ruleResults && result.ruleResults.length > 0 && (
        <>
          <Divider orientation="left" plain>Rule Results</Divider>
          <Table<RuleResult>
            dataSource={result.ruleResults}
            rowKey="name"
            size="small"
            pagination={false}
            columns={[
              { title: 'Rule', dataIndex: 'name', render: (n: string) => <Text code>{n}</Text> },
              {
                title: 'Passed',
                dataIndex: 'result',
                render: (r: boolean) => r
                  ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  : <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
              },
              { title: 'Action', dataIndex: 'action', render: (a: string) => a ? <Tag>{a}</Tag> : '—' },
              { title: 'Outcome', dataIndex: 'outcome', render: (o: string) => o ? <Tag color="blue">{o}</Tag> : '—' },
            ]}
          />
        </>
      )}

      {result.totalScore !== undefined && (
        <>
          <Divider orientation="left" plain>Scorecard</Divider>
          <Space>
            <Text>Score:</Text>
            <Text strong>{result.totalScore} / {result.maxPossibleScore}</Text>
            {result.label && <Tag color="blue">{result.label}</Tag>}
          </Space>
          {result.breakdown && (
            <Table<ScorecardBreakdownEntry>
              dataSource={result.breakdown}
              rowKey="variable"
              size="small"
              pagination={false}
              columns={[
                { title: 'Variable', dataIndex: 'variable', render: (v: string) => <Text code>{v}</Text> },
                { title: 'Band', dataIndex: 'matchedBand', render: (b?: string) => b ?? '—' },
                { title: 'Points', dataIndex: 'points', render: (p?: number) => p ?? '—' },
              ]}
            />
          )}
        </>
      )}

      {result.tableOutput !== undefined && (
        <>
          <Divider orientation="left" plain>Table Output</Divider>
          <Text>{result.outputColumn}: <Text strong>{String(result.tableOutput)}</Text></Text>
        </>
      )}
    </Space>
  );
}

// ── Test Console Tab ──────────────────────────────────────────────────────────

function TestConsoleTab({ policyId, versions }: { policyId: string; versions: PolicySummary[] }) {
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [traceLevel, setTraceLevel] = useState('STANDARD');
  const [evaluatedBy, setEvaluatedBy] = useState('');
  const [contextJson, setContextJson] = useState('{\n  \n}');
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeVersion = versions.find((v) => v.status === 'ACTIVE');

  const run = async () => {
    setError(null);
    setResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(contextJson);
    } catch {
      setError('Invalid JSON in context');
      return;
    }
    setRunning(true);
    try {
      const res = await evaluate(policyId, selectedVersion, parsed, traceLevel, evaluatedBy);
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Evaluation failed');
    } finally {
      setRunning(false);
    }
  };

  const versionOptions = versions.map((v) => ({
    value: v.version,
    label: (
      <Space>
        <Text code>{v.version}</Text>
        <Tag color={STATUS_COLORS[v.status]} style={{ margin: 0 }}>{v.status}</Tag>
      </Space>
    ),
  }));

  return (
    <Space direction="vertical" size={16} style={{ width: '100%', maxWidth: 700 }}>
      <Space wrap>
        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>Version</Text>
          <Select
            style={{ width: 200 }}
            placeholder={activeVersion ? `${activeVersion.version} (active)` : 'Latest active'}
            allowClear
            value={selectedVersion}
            onChange={setSelectedVersion}
            options={versionOptions}
          />
        </div>
        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>Trace Level</Text>
          <Select
            style={{ width: 130 }}
            value={traceLevel}
            onChange={setTraceLevel}
            options={[
              { value: 'MINIMAL', label: 'Minimal' },
              { value: 'STANDARD', label: 'Standard' },
              { value: 'FULL', label: 'Full' },
            ]}
          />
        </div>
        <div>
          <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>Evaluated By</Text>
          <Input
            style={{ width: 160 }}
            placeholder="optional"
            value={evaluatedBy}
            onChange={(e) => setEvaluatedBy(e.target.value)}
          />
        </div>
      </Space>

      <div>
        <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>Context (JSON)</Text>
        <TextArea
          value={contextJson}
          onChange={(e) => setContextJson(e.target.value)}
          rows={10}
          style={{ fontFamily: 'monospace', fontSize: 13 }}
          spellCheck={false}
        />
      </div>

      <Button
        type="primary"
        icon={<PlayCircleOutlined />}
        loading={running}
        onClick={run}
      >
        Run Evaluation
      </Button>

      {error && <Alert type="error" message={error} showIcon />}
      {result && (
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 20 }}>
          <ResultDisplay result={result} />
        </div>
      )}
    </Space>
  );
}

// ── Audit Log Tab ─────────────────────────────────────────────────────────────

function AuditLogTab({ policyId }: { policyId: string }) {
  const [logs, setLogs] = useState<EvaluationLogSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detail, setDetail] = useState<EvaluationLogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const PAGE_SIZE = 15;

  const load = useCallback((p: number) => {
    setLoading(true);
    fetchEvaluations(policyId, p, PAGE_SIZE)
      .then((data) => { setLogs(data.content); setTotal(data.totalElements); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [policyId]);

  useEffect(() => { load(0); }, [load]);

  const openDetail = async (id: string) => {
    setDrawerOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await fetchEvaluationDetail(id));
    } finally {
      setDetailLoading(false);
    }
  };

  const columns: ColumnsType<EvaluationLogSummary> = [
    {
      title: 'Time',
      dataIndex: 'evaluatedAt',
      render: (t: string) => <Text style={{ fontSize: 12 }}>{new Date(t).toLocaleString()}</Text>,
    },
    {
      title: 'Version',
      dataIndex: 'policyVersion',
      render: (v: string) => <Text code>{v}</Text>,
    },
    {
      title: 'Outcome',
      dataIndex: 'outcome',
      render: (o?: string) => o ? <Text strong>{o}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (s: string) => (
        <Tag color={s === 'SUCCESS' ? 'success' : 'error'}>{s}</Tag>
      ),
    },
    {
      title: 'Duration',
      dataIndex: 'durationMs',
      render: (ms: number) => <Text type="secondary">{ms}ms</Text>,
    },
    {
      title: 'Evaluated By',
      dataIndex: 'evaluatedBy',
      render: (v?: string) => <Text type="secondary">{v ?? '—'}</Text>,
    },
  ];

  return (
    <>
      <Spin spinning={loading}>
        <Table
          dataSource={logs}
          columns={columns}
          rowKey="id"
          size="small"
          onRow={(row) => ({ onClick: () => openDetail(row.id), style: { cursor: 'pointer' } })}
          pagination={{
            total,
            pageSize: PAGE_SIZE,
            current: page + 1,
            onChange: (p) => { setPage(p - 1); load(p - 1); },
            showTotal: (t) => `${t} evaluations`,
          }}
        />
      </Spin>

      <Drawer
        title="Evaluation Detail"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={600}
      >
        {detailLoading && <Spin />}
        {detail && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space wrap>
              <Tag color={detail.status === 'SUCCESS' ? 'success' : 'error'}>{detail.status}</Tag>
              {detail.outcome && <Text strong>{detail.outcome}</Text>}
              <Text type="secondary">{detail.durationMs}ms</Text>
              <Text type="secondary">{new Date(detail.evaluatedAt).toLocaleString()}</Text>
            </Space>

            {detail.errorMessage && (
              <Alert type="error" message={detail.errorMessage} showIcon />
            )}

            <div>
              <Text type="secondary" strong>Context</Text>
              <pre style={{
                background: '#f6f8fa', padding: 12, borderRadius: 6,
                fontSize: 12, overflow: 'auto', marginTop: 8,
              }}>
                {JSON.stringify(JSON.parse(detail.context || '{}'), null, 2)}
              </pre>
            </div>

            {detail.result && (
              <div>
                <Text type="secondary" strong>Result</Text>
                <pre style={{
                  background: '#f6f8fa', padding: 12, borderRadius: 6,
                  fontSize: 12, overflow: 'auto', marginTop: 8,
                }}>
                  {JSON.stringify(JSON.parse(detail.result), null, 2)}
                </pre>
              </div>
            )}
          </Space>
        )}
      </Drawer>
    </>
  );
}

// ── Type / status visual helpers ──────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  RULE_CHAIN: '#6366f1', DECISION_TABLE: '#7c3aed', SCORECARD: '#0891b2',
};
const TYPE_BG: Record<string, string> = {
  RULE_CHAIN: '#eef2ff', DECISION_TABLE: '#f5f3ff', SCORECARD: '#ecfeff',
};
const TYPE_LABEL: Record<string, string> = {
  RULE_CHAIN: 'Rule Chain', DECISION_TABLE: 'Decision Table', SCORECARD: 'Scorecard',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PolicyDetail() {
  const { policyId } = useParams<{ policyId: string }>();
  const navigate = useNavigate();
  const [versions, setVersions] = useState<PolicySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!policyId) return;
    fetchVersions(policyId)
      .then(setVersions)
      .finally(() => setLoading(false));
  }, [policyId]);

  const handleDelete = async () => {
    if (!policyId) return;
    setDeleting(true);
    try {
      await deletePolicy(policyId);
      message.success('Policy deleted');
      navigate('/');
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Delete failed');
      setDeleting(false);
    }
  };

  const latest = versions[0];

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>

      {/* Page header */}
      <div style={{
        background: '#fff',
        borderBottom: '1px solid #e2e8f0',
        padding: '20px 36px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/')}
            style={{ color: '#64748b', padding: '0 0 12px', height: 'auto', fontSize: 13 }}
          >
            Back to Policies
          </Button>
          <Popconfirm
            title="Delete this policy?"
            description="All versions and their data will be permanently removed."
            onConfirm={handleDelete}
            okText="Delete"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
            placement="bottomRight"
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              loading={deleting}
              size="small"
            >
              Delete Policy
            </Button>
          </Popconfirm>
        </div>

        <Spin spinning={loading}>
          {latest && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: TYPE_BG[latest.type],
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, color: TYPE_COLOR[latest.type],
              }}>
                {latest.type === 'RULE_CHAIN' ? '⛓' : latest.type === 'DECISION_TABLE' ? '⊞' : '◎'}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Title level={4} style={{ margin: 0, color: '#0f172a' }}>{latest.name}</Title>
                  <Tag style={{
                    color: TYPE_COLOR[latest.type],
                    background: TYPE_BG[latest.type],
                    border: 'none', fontWeight: 500, fontSize: 11,
                  }}>
                    {TYPE_LABEL[latest.type]}
                  </Tag>
                </div>
                <Text style={{ fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}>
                  {latest.policyId}
                </Text>
              </div>
            </div>
          )}
        </Spin>
      </div>

      {/* Tabs */}
      <div style={{ padding: '0 36px' }}>
        <Tabs
          defaultActiveKey="versions"
          style={{ marginTop: 8 }}
          items={[
            {
              key: 'versions',
              label: 'Versions',
              children: (
                <div style={{
                  background: '#fff', borderRadius: 12,
                  border: '1px solid #e2e8f0', padding: 24,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}>
                  {policyId ? <VersionsTab policyId={policyId} /> : null}
                </div>
              ),
            },
            {
              key: 'test',
              label: 'Test Console',
              children: (
                <div style={{
                  background: '#fff', borderRadius: 12,
                  border: '1px solid #e2e8f0', padding: 24,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}>
                  {policyId
                    ? <TestConsoleTab policyId={policyId} versions={versions} />
                    : null}
                </div>
              ),
            },
            {
              key: 'audit',
              label: 'Audit Log',
              children: (
                <div style={{
                  background: '#fff', borderRadius: 12,
                  border: '1px solid #e2e8f0', padding: 24,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}>
                  {policyId ? <AuditLogTab policyId={policyId} /> : null}
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
