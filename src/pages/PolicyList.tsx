import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Tag, Typography, Alert, Spin, Button, Input,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, FileTextOutlined,
  CheckCircleFilled, ClockCircleFilled, PauseCircleFilled, StopFilled,
  BranchesOutlined, TableOutlined, BarChartOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { fetchPolicies } from '../api/client';
import type { PolicySummary, PolicyType, PolicyStatus } from '../types';

const { Title, Text } = Typography;

// ── Types ─────────────────────────────────────────────────────────────────────

interface PolicyRow {
  policyId: string;
  name: string;
  type: PolicyType;
  latestVersion: string;
  latestStatus: PolicyStatus;
  versionCount: number;
  updatedAt: string;
  createdBy?: string;
}

function groupPolicies(summaries: PolicySummary[]): PolicyRow[] {
  const map = new Map<string, PolicyRow>();
  for (const s of summaries) {
    if (!map.has(s.policyId)) {
      map.set(s.policyId, {
        policyId: s.policyId,
        name: s.name,
        type: s.type,
        latestVersion: s.version,
        latestStatus: s.status,
        versionCount: 1,
        updatedAt: s.updatedAt,
        createdBy: s.createdBy,
      });
    } else {
      map.get(s.policyId)!.versionCount++;
    }
  }
  return Array.from(map.values());
}

// ── Visual maps ───────────────────────────────────────────────────────────────

const TYPE_META: Record<PolicyType, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  RULE_CHAIN:     { label: 'Rule Chain',     color: '#6366f1', bg: '#eef2ff', icon: <BranchesOutlined /> },
  DECISION_TABLE: { label: 'Decision Table', color: '#7c3aed', bg: '#f5f3ff', icon: <TableOutlined /> },
  SCORECARD:      { label: 'Scorecard',      color: '#0891b2', bg: '#ecfeff', icon: <BarChartOutlined /> },
};

const STATUS_META: Record<PolicyStatus, { label: string; color: string; icon: React.ReactNode }> = {
  ACTIVE:   { label: 'Active',   color: '#10b981', icon: <CheckCircleFilled style={{ color: '#10b981' }} /> },
  DRAFT:    { label: 'Draft',    color: '#f59e0b', icon: <ClockCircleFilled style={{ color: '#f59e0b' }} /> },
  INACTIVE: { label: 'Inactive', color: '#94a3b8', icon: <PauseCircleFilled style={{ color: '#94a3b8' }} /> },
  ARCHIVED: { label: 'Archived', color: '#ef4444', icon: <StopFilled        style={{ color: '#ef4444' }} /> },
};

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, accent, icon,
}: { label: string; value: number; accent: string; icon: React.ReactNode }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      padding: '20px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <div style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        background: accent + '18',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 20,
        color: accent,
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', lineHeight: 1.1 }}>
          {value}
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PolicyList() {
  const [all, setAll]       = useState<PolicyRow[]>([]);
  const [rows, setRows]     = useState<PolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchPolicies()
      .then((data) => {
        const grouped = groupPolicies(data);
        setAll(grouped);
        setRows(grouped);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Search filter
  useEffect(() => {
    const q = search.trim().toLowerCase();
    setRows(q ? all.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.policyId.toLowerCase().includes(q)
    ) : all);
  }, [search, all]);

  // Stats
  const stats = {
    total:    all.length,
    active:   all.filter(r => r.latestStatus === 'ACTIVE').length,
    draft:    all.filter(r => r.latestStatus === 'DRAFT').length,
    archived: all.filter(r => r.latestStatus === 'ARCHIVED').length,
  };

  const columns: ColumnsType<PolicyRow> = [
    {
      title: 'Policy',
      key: 'policy',
      render: (_: unknown, row: PolicyRow) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: TYPE_META[row.type].bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: TYPE_META[row.type].color, fontSize: 16,
          }}>
            {TYPE_META[row.type].icon}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{row.name}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
              {row.policyId}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (t: PolicyType) => (
        <Tag
          style={{
            color: TYPE_META[t].color,
            background: TYPE_META[t].bg,
            border: 'none',
            fontWeight: 500,
            fontSize: 11,
          }}
        >
          {TYPE_META[t].label}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'latestStatus',
      key: 'latestStatus',
      render: (s: PolicyStatus) => {
        const m = STATUS_META[s];
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: m.color, fontWeight: 500 }}>
            {m.icon} {m.label}
          </span>
        );
      },
    },
    {
      title: 'Version',
      dataIndex: 'latestVersion',
      key: 'latestVersion',
      render: (v: string) => (
        <Text code style={{ fontSize: 11, background: '#f1f5f9', borderColor: '#e2e8f0' }}>{v}</Text>
      ),
    },
    {
      title: 'Versions',
      dataIndex: 'versionCount',
      key: 'versionCount',
      align: 'center',
      render: (n: number) => (
        <span style={{
          display: 'inline-block',
          background: '#f1f5f9',
          borderRadius: 20,
          padding: '1px 10px',
          fontSize: 12,
          color: '#475569',
          fontWeight: 500,
        }}>
          {n}
        </span>
      ),
    },
    {
      title: 'Last Updated',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (t: string) => (
        <Text style={{ fontSize: 12, color: '#64748b' }}>
          {new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
        </Text>
      ),
    },
    {
      title: 'Created By',
      dataIndex: 'createdBy',
      key: 'createdBy',
      render: (v?: string) => (
        <Text style={{ fontSize: 12, color: '#94a3b8' }}>{v ?? '—'}</Text>
      ),
    },
  ];

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1200 }}>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <Title level={4} style={{ margin: 0, color: '#0f172a', fontWeight: 700 }}>Policies</Title>
        <Text style={{ color: '#64748b', fontSize: 13 }}>
          Manage and monitor all your decision policies
        </Text>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        <StatCard label="Total Policies" value={stats.total}    accent="#6366f1" icon={<FileTextOutlined />} />
        <StatCard label="Active"         value={stats.active}   accent="#10b981" icon={<CheckCircleFilled />} />
        <StatCard label="Draft"          value={stats.draft}    accent="#f59e0b" icon={<ClockCircleFilled />} />
        <StatCard label="Archived"       value={stats.archived} accent="#ef4444" icon={<StopFilled />} />
      </div>

      {/* Table card */}
      <div style={{
        background: '#fff',
        borderRadius: 14,
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        {/* Toolbar */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="Search by name or ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 260, borderRadius: 8 }}
            allowClear
          />
          <div style={{ flex: 1 }} />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/policies/new')}
            style={{ borderRadius: 8, fontWeight: 500 }}
          >
            New Policy
          </Button>
        </div>

        {error && (
          <div style={{ padding: 20 }}>
            <Alert type="error" message={error} showIcon />
          </div>
        )}

        <Spin spinning={loading}>
          <Table
            dataSource={rows}
            columns={columns}
            rowKey="policyId"
            onRow={(row) => ({
              onClick: () => navigate(`/policies/${row.policyId}`),
              style: { cursor: 'pointer' },
            })}
            pagination={{ pageSize: 20, hideOnSinglePage: true }}
            size="middle"
            locale={{
              emptyText: (
                <div style={{ padding: '48px 0', textAlign: 'center' }}>
                  <FileTextOutlined style={{ fontSize: 36, color: '#cbd5e1', marginBottom: 12 }} />
                  <div style={{ color: '#94a3b8', fontSize: 14 }}>No policies yet</div>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    style={{ marginTop: 16 }}
                    onClick={() => navigate('/policies/new')}
                  >
                    Create your first policy
                  </Button>
                </div>
              ),
            }}
          />
        </Spin>
      </div>
    </div>
  );
}
