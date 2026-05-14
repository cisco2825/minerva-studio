import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Tag, Typography, Alert, Spin, Button, Input } from 'antd';
import {
  PlusOutlined, SearchOutlined, FileTextOutlined,
  CheckCircleFilled, ClockCircleFilled, PauseCircleFilled, StopFilled,
  BranchesOutlined, TableOutlined, BarChartOutlined,
} from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { fetchPoliciesPage, fetchPolicyStats } from '../api/client';
import type { PolicySummary, PolicyType, PolicyStatus, PolicyStats } from '../types';

const { Title, Text } = Typography;

// ── Visual maps ───────────────────────────────────────────────────────────────

const TYPE_META: Record<PolicyType, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  RULE_CHAIN:     { label: 'Rule Chain',     color: '#6366f1', bg: '#eef2ff', icon: <BranchesOutlined /> },
  DECISION_TABLE: { label: 'Decision Table', color: '#7c3aed', bg: '#f5f3ff', icon: <TableOutlined /> },
  SCORECARD:      { label: 'Scorecard',      color: '#0891b2', bg: '#ecfeff', icon: <BarChartOutlined /> },
};

const STATUS_META: Record<PolicyStatus, { label: string; color: string; icon: React.ReactNode }> = {
  ACTIVE:   { label: 'Active',   color: '#10b981', icon: <CheckCircleFilled  style={{ color: '#10b981' }} /> },
  DRAFT:    { label: 'Draft',    color: '#f59e0b', icon: <ClockCircleFilled  style={{ color: '#f59e0b' }} /> },
  INACTIVE: { label: 'Inactive', color: '#94a3b8', icon: <PauseCircleFilled  style={{ color: '#94a3b8' }} /> },
  ARCHIVED: { label: 'Archived', color: '#ef4444', icon: <StopFilled         style={{ color: '#ef4444' }} /> },
};

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, accent, icon, loading,
}: { label: string; value: number; accent: string; icon: React.ReactNode; loading: boolean }) {
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
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: accent + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, color: accent,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', lineHeight: 1.1 }}>
          {loading ? '—' : value}
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function PolicyList() {
  const navigate = useNavigate();

  // Table state
  const [rows, setRows]           = useState<PolicySummary[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(0);
  const [tableLoading, setTableLoading] = useState(true);
  const [tableError, setTableError]     = useState<string | null>(null);

  // Stats state (loaded independently)
  const [stats, setStats]         = useState<PolicyStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Search (client-side filter on the current page — full server-side search can be added later)
  const [search, setSearch]       = useState('');

  const loadPage = (p: number) => {
    setTableLoading(true);
    setTableError(null);
    fetchPoliciesPage(p, PAGE_SIZE)
      .then(data => {
        setRows(data.content);
        setTotal(data.totalElements);
        setPage(data.number);
      })
      .catch((e: Error) => setTableError(e.message))
      .finally(() => setTableLoading(false));
  };

  useEffect(() => { loadPage(0); }, []);

  useEffect(() => {
    fetchPolicyStats()
      .then(setStats)
      .catch(() => {/* stats are non-critical — fail silently */})
      .finally(() => setStatsLoading(false));
  }, []);

  const handleTableChange = (pagination: TablePaginationConfig) => {
    loadPage((pagination.current ?? 1) - 1);
  };

  // Filter visible rows by search (over current page)
  const visible = search.trim()
    ? rows.filter(r =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.policyId.toLowerCase().includes(search.toLowerCase()),
      )
    : rows;

  const columns: ColumnsType<PolicySummary> = [
    {
      title: 'Policy',
      key: 'policy',
      render: (_: unknown, row: PolicySummary) => (
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
        <Tag style={{
          color: TYPE_META[t].color,
          background: TYPE_META[t].bg,
          border: 'none', fontWeight: 500, fontSize: 11,
        }}>
          {TYPE_META[t].label}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
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
      title: 'Latest Version',
      dataIndex: 'version',
      key: 'version',
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
          background: '#f1f5f9', borderRadius: 20,
          padding: '1px 10px', fontSize: 12, color: '#475569', fontWeight: 500,
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
      render: (v?: string) => <Text style={{ fontSize: 12, color: '#94a3b8' }}>{v ?? '—'}</Text>,
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

      {/* Stat cards — loaded independently from the backend */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        <StatCard label="Total Policies" value={stats?.total    ?? 0} accent="#6366f1" icon={<FileTextOutlined />}   loading={statsLoading} />
        <StatCard label="Active"         value={stats?.active   ?? 0} accent="#10b981" icon={<CheckCircleFilled />}  loading={statsLoading} />
        <StatCard label="Draft"          value={stats?.draft    ?? 0} accent="#f59e0b" icon={<ClockCircleFilled />}  loading={statsLoading} />
        <StatCard label="Archived"       value={stats?.archived ?? 0} accent="#ef4444" icon={<StopFilled />}         loading={statsLoading} />
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
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="Filter by name or ID…"
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

        {tableError && (
          <div style={{ padding: 20 }}>
            <Alert type="error" message={tableError} showIcon />
          </div>
        )}

        <Spin spinning={tableLoading}>
          <Table
            dataSource={visible}
            columns={columns}
            rowKey="id"
            onRow={(row) => ({
              onClick: () => navigate(`/policies/${row.policyId}`),
              style: { cursor: 'pointer' },
            })}
            onChange={handleTableChange}
            pagination={{
              current: page + 1,
              pageSize: PAGE_SIZE,
              total,
              showTotal: (t, range) => `${range[0]}–${range[1]} of ${t} policies`,
              showSizeChanger: false,
            }}
            size="middle"
            locale={{
              emptyText: (
                <div style={{ padding: '48px 0', textAlign: 'center' }}>
                  <FileTextOutlined style={{ fontSize: 36, color: '#cbd5e1', marginBottom: 12 }} />
                  <div style={{ color: '#94a3b8', fontSize: 14 }}>No policies yet</div>
                  <Button
                    type="primary" icon={<PlusOutlined />}
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
