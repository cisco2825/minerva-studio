import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Typography, Alert, Spin, Button, Input, Modal } from 'antd';
import {
  PlusOutlined, SearchOutlined, FileTextOutlined,
  CheckCircleFilled, ClockCircleFilled, PauseCircleFilled, StopFilled,
  DeleteOutlined, BranchesOutlined, UploadOutlined, InboxOutlined,
} from '@ant-design/icons';
import { Popconfirm, message } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { fetchPoliciesPage, fetchPolicyStats, deletePolicy, createPolicy } from '../api/client';
import { UserBadge } from '../components/UserBadge';
import type { PolicySummary, PolicyStatus, PolicyStats, SavePolicyRequest } from '../types';

const { Title, Text } = Typography;

const STATUS_META: Record<PolicyStatus, { label: string; color: string; icon: React.ReactNode }> = {
  ACTIVE:   { label: 'Active',   color: '#10b981', icon: <CheckCircleFilled  style={{ color: '#10b981' }} /> },
  DRAFT:    { label: 'Draft',    color: '#f59e0b', icon: <ClockCircleFilled  style={{ color: '#f59e0b' }} /> },
  INACTIVE: { label: 'Inactive', color: '#94a3b8', icon: <PauseCircleFilled  style={{ color: '#94a3b8' }} /> },
  ARCHIVED: { label: 'Archived', color: '#ef4444', icon: <StopFilled         style={{ color: '#ef4444' }} /> },
};

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, accent, icon, loading,
}: { label: string; value: number | null; accent: string; icon: React.ReactNode; loading: boolean }) {
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
          {loading || value === null ? '—' : value}
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

  // Stats — loaded independently; null means endpoint not available yet
  const [stats, setStats]               = useState<PolicyStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Search (client-side filter on the current page — full server-side search can be added later)
  const [search, setSearch]       = useState('');

  // Import modal state
  const [importOpen, setImportOpen]       = useState(false);
  const [importData, setImportData]       = useState<SavePolicyRequest | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importError, setImportError]     = useState<string | null>(null);
  const [importing, setImporting]         = useState(false);
  const fileInputRef                      = useRef<HTMLInputElement>(null);

  const loadPage = (p: number) => {
    setTableLoading(true);
    setTableError(null);
    fetchPoliciesPage(p, PAGE_SIZE)
      .then(data => {
        setRows(data.content);
        setTotal(data.totalElements);
        setPage(data.number ?? p);   // guard: old API may not return .number
      })
      .catch((e: Error) => setTableError(e.message))
      .finally(() => setTableLoading(false));
  };

  useEffect(() => { loadPage(0); }, []);

  useEffect(() => {
    fetchPolicyStats()
      .then(setStats)          // null when backend not updated yet — cards show '—'
      .finally(() => setStatsLoading(false));
  }, []);

  const handleTableChange = (pagination: TablePaginationConfig) => {
    loadPage((pagination.current ?? 1) - 1);
  };

  const handleDelete = async (policyId: string) => {
    try {
      await deletePolicy(policyId);
      message.success('Policy deleted');
      loadPage(page);
      fetchPolicyStats().then(setStats).catch(() => {});
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  // ── Import handlers ───────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    setImportData(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      setImportError('Only JSON files are accepted');
      return;
    }
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as SavePolicyRequest;
        if (!parsed.policy?.id || !parsed.policy?.version) {
          setImportError('Invalid policy JSON — missing policy ID or version');
          return;
        }
        setImportData(parsed);
      } catch {
        setImportError('Could not parse JSON file');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importData) return;
    setImporting(true);
    try {
      await createPolicy(importData);
      message.success(`Policy "${importData.policy.name || importData.policy.id}" imported successfully`);
      setImportOpen(false);
      setImportData(null);
      setImportFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadPage(0);
      fetchPolicyStats().then(setStats).catch(() => {});
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleImportClose = () => {
    setImportOpen(false);
    setImportData(null);
    setImportFileName('');
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
            background: '#eef2ff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#6366f1', fontSize: 16,
          }}>
            <BranchesOutlined />
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
      render: (v?: string) => <UserBadge name={v} />,
    },
    {
      key: 'actions',
      width: 48,
      render: (_: unknown, row: PolicySummary) => (
        <div onClick={e => e.stopPropagation()}>
          <Popconfirm
            title="Delete policy?"
            description={`This will permanently delete all versions of "${row.name}".`}
            onConfirm={() => handleDelete(row.policyId)}
            okText="Delete"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
          >
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
            />
          </Popconfirm>
        </div>
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

      {/* Stat cards — loaded independently from the backend */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        <StatCard label="Total Policies" value={stats?.total    ?? null} accent="#6366f1" icon={<FileTextOutlined />}   loading={statsLoading} />
        <StatCard label="Active"         value={stats?.active   ?? null} accent="#10b981" icon={<CheckCircleFilled />}  loading={statsLoading} />
        <StatCard label="Draft"          value={stats?.draft    ?? null} accent="#f59e0b" icon={<ClockCircleFilled />}  loading={statsLoading} />
        <StatCard label="Archived"       value={stats?.archived ?? null} accent="#ef4444" icon={<StopFilled />}         loading={statsLoading} />
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
            icon={<UploadOutlined />}
            onClick={() => setImportOpen(true)}
            style={{ borderRadius: 8, fontWeight: 500 }}
          >
            Import
          </Button>
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

      {/* ── Import Policy Modal ─────────────────────────────────────────── */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <Modal
        open={importOpen}
        onCancel={handleImportClose}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 7, background: '#eef2ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#4f46e5', fontSize: 14,
            }}>
              <UploadOutlined />
            </div>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Import Policy</span>
          </div>
        }
        footer={[
          <Button key="cancel" onClick={handleImportClose}>Cancel</Button>,
          <Button
            key="import"
            type="primary"
            loading={importing}
            disabled={!importData}
            onClick={handleImport}
            style={{ background: '#4f46e5', borderColor: '#4f46e5' }}
          >
            Import
          </Button>,
        ]}
        width={480}
      >
        {/* Drop zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${importData ? '#6366f1' : '#e2e8f0'}`,
            borderRadius: 10,
            padding: '28px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: importData ? '#f5f3ff' : '#fafafa',
            transition: 'all 0.2s',
            marginBottom: importError || importData ? 16 : 0,
          }}
        >
          <InboxOutlined style={{ fontSize: 32, color: importData ? '#6366f1' : '#cbd5e1', marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>
            {importFileName
              ? <><span style={{ color: '#6366f1' }}>{importFileName}</span></>
              : <><span style={{ color: '#6366f1', fontWeight: 600 }}>Click to choose</span> a JSON file</>
            }
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Exported policy JSON files only</div>
        </div>

        {importError && (
          <Alert type="error" message={importError} showIcon style={{ borderRadius: 8 }} />
        )}

        {importData && !importError && (
          <div style={{
            background: '#f8fafc', border: '1px solid #e2e8f0',
            borderRadius: 10, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Policy Preview
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', rowGap: 7 }}>
              <Text style={{ fontSize: 12, color: '#94a3b8' }}>Name</Text>
              <Text style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                {importData.policy.name || importData.policy.id}
              </Text>
              <Text style={{ fontSize: 12, color: '#94a3b8' }}>Policy ID</Text>
              <Text code style={{ fontSize: 12 }}>{importData.policy.id}</Text>
              <Text style={{ fontSize: 12, color: '#94a3b8' }}>Version</Text>
              <Text code style={{ fontSize: 12 }}>{importData.policy.version}</Text>
              <Text style={{ fontSize: 12, color: '#94a3b8' }}>Type</Text>
              <Text style={{ fontSize: 12, color: '#475569' }}>{importData.policy.type}</Text>
              <Text style={{ fontSize: 12, color: '#94a3b8' }}>Nodes</Text>
              <Text style={{ fontSize: 12, color: '#475569' }}>{importData.policy.nodes?.length ?? 0}</Text>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
