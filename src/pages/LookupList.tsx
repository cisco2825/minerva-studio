import { useEffect, useState } from 'react';
import {
  Table, Typography, Alert, Spin, Button, Input, Drawer,
  Form, Upload, Progress, Popconfirm, message, Tooltip, Tabs, Tag,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';
import {
  PlusOutlined, SearchOutlined, TableOutlined,
  DeleteOutlined, InboxOutlined, InfoCircleOutlined, DownloadOutlined,
  CopyOutlined, HistoryOutlined, UploadOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { UserBadge } from '../components/UserBadge';
import {
  fetchLookupsPage, fetchLookupVersions, uploadLookupFile,
  saveLookup, deleteLookup, downloadLookupFile, updateLookupStatus,
} from '../api/client';
import type { LookupSummary, LookupStatus } from '../types';

const { Title, Text } = Typography;
const { Dragger } = Upload;

// ── Slug helper ───────────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Info row ──────────────────────────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '130px 1fr',
      padding: '11px 0', borderBottom: '1px solid #f1f5f9',
      alignItems: 'start',
    }}>
      <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500, paddingTop: 1 }}>{label}</Text>
      <div style={{ fontSize: 13, color: '#0f172a' }}>{children}</div>
    </div>
  );
}

// ── Status badge helper ───────────────────────────────────────────────────────

const STATUS_STYLE: Record<LookupStatus, { color: string; bg: string; border: string }> = {
  ACTIVE:   { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  INACTIVE: { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  DRAFT:    { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  ARCHIVED: { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
};

function StatusBadge({ status }: { status: LookupStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.DRAFT;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '1px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      letterSpacing: '0.02em', border: `1px solid ${s.border}`,
      color: s.color, background: s.bg,
    }}>
      {status}
    </span>
  );
}

// ── Next-version suggester ────────────────────────────────────────────────────

function suggestNextVersion(versions: LookupSummary[]): string {
  if (versions.length === 0) return 'v2';
  // Take the most recent version string and try to increment it
  const latest = versions[0].version;

  // Pattern: v<N>  e.g. v1 → v2
  const vNum = latest.match(/^v(\d+)$/i);
  if (vNum) return `v${parseInt(vNum[1], 10) + 1}`;

  // Pattern: <N>.<M>  e.g. 1.0 → 1.1 or 2.3 → 2.4
  const semver = latest.match(/^(\d+)\.(\d+)$/);
  if (semver) return `${semver[1]}.${parseInt(semver[2], 10) + 1}`;

  // Pattern: <N>  e.g. 1 → 2
  const bare = latest.match(/^(\d+)$/);
  if (bare) return `${parseInt(bare[1], 10) + 1}`;

  // Fallback: append -2, -3 …
  const dashNum = latest.match(/^(.+)-(\d+)$/);
  if (dashNum) return `${dashNum[1]}-${parseInt(dashNum[2], 10) + 1}`;
  return `${latest}-2`;
}

// ── Lookup Detail Drawer ──────────────────────────────────────────────────────

function LookupDetailDrawer({
  lookup, open, onClose, onDeleted,
}: {
  lookup: LookupSummary | null;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [versions, setVersions]         = useState<LookupSummary[]>([]);
  const [versionsLoading, setVL]        = useState(false);
  const [downloading, setDownloading]   = useState(false);
  const [copied, setCopied]             = useState(false);
  const [activeTab, setActiveTab]       = useState('info');

  // ── New-version form state ────────────────────────────────────────────────
  const [addVersionOpen, setAddVersionOpen] = useState(false);
  const [newVersion, setNewVersion]         = useState('');
  const [nvFileList, setNvFileList]         = useState<UploadFile[]>([]);
  const [nvUploading, setNvUploading]       = useState(false);
  const [nvPct, setNvPct]                   = useState(0);
  const [nvError, setNvError]               = useState<string | null>(null);

  const reloadVersions = (lookupId: string) => {
    setVL(true);
    fetchLookupVersions(lookupId)
      .then(vs => setVersions(vs as unknown as LookupSummary[]))
      .catch(() => setVersions([]))
      .finally(() => setVL(false));
  };

  useEffect(() => {
    if (!lookup || !open) return;
    setActiveTab('info');
    setAddVersionOpen(false);
    reloadVersions(lookup.lookupId);
  }, [lookup?.lookupId, open]);

  // Suggest a next version whenever the versions list changes and the form is opened
  useEffect(() => {
    if (addVersionOpen) setNewVersion(suggestNextVersion(versions));
  }, [addVersionOpen, versions]);

  if (!lookup) return null;

  // Show the ACTIVE version's details in the Info tab; fall back to the prop
  // (latest-by-date) only if no active version has been loaded yet.
  const activeVersion = versions.find(v => v.status === 'ACTIVE') ?? lookup;

  const usageExample = `field IN LOOKUP("${lookup.lookupId}", "column_name")`;

  const handleCopy = () => {
    navigator.clipboard.writeText(usageExample).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadLookupFile(lookup.lookupId, lookup.version);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteLookup(lookup.lookupId);
      message.success('Lookup deleted');
      onClose();
      onDeleted();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleAddVersion = async () => {
    setNvError(null);
    if (!newVersion.trim())                    { setNvError('Version is required'); return; }
    if (!nvFileList[0]?.originFileObj)         { setNvError('Please select a CSV file'); return; }

    try {
      setNvUploading(true);
      setNvPct(30);
      const upload = await uploadLookupFile(nvFileList[0].originFileObj as File, lookup.lookupId, newVersion.trim());
      setNvPct(70);
      await saveLookup({
        lookupId: lookup.lookupId,
        version: newVersion.trim(),
        name: lookup.name,
        description: lookup.description,
        lookup: { type: 'FILE', fileRef: upload.fileRef, format: 'CSV', columns: upload.columns },
      });
      setNvPct(100);
      message.success(`Version ${newVersion.trim()} uploaded`);
      setAddVersionOpen(false);
      setNvFileList([]);
      setNvPct(0);
      reloadVersions(lookup.lookupId);
      setActiveTab('history');
    } catch (e: unknown) {
      setNvError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setNvUploading(false);
    }
  };

  const handleActivate = async (row: LookupSummary) => {
    try {
      await updateLookupStatus(row.lookupId, row.version, 'ACTIVE');
      message.success(`Version ${row.version} is now active`);
      reloadVersions(lookup.lookupId);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Status update failed');
    }
  };

  const versionColumns: ColumnsType<LookupSummary> = [
    {
      title: 'Version',
      dataIndex: 'version',
      render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (s: LookupStatus) => <StatusBadge status={s} />,
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      render: (t: string) => (
        <Text style={{ fontSize: 12, color: '#64748b' }}>{formatDate(t)}</Text>
      ),
    },
    {
      title: 'By',
      dataIndex: 'createdBy',
      render: (v?: string) => <UserBadge name={v} avatarOnly size={22} />,
    },
    {
      key: 'actions',
      width: 72,
      render: (_: unknown, row: LookupSummary) => (
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Tooltip title="Download CSV">
            <Button
              type="text" size="small" icon={<DownloadOutlined />}
              onClick={() => downloadLookupFile(row.lookupId, row.version).catch(() => {})}
            />
          </Tooltip>
          {/* Only show Activate for non-active versions. Active version needs no action —
              it gets retired automatically when another version is activated. */}
          {row.status !== 'ACTIVE' && row.status !== 'ARCHIVED' && (
            <Tooltip title="Set as active version">
              <Button
                type="text" size="small"
                icon={<CheckCircleOutlined style={{ color: '#16a34a' }} />}
                onClick={() => handleActivate(row)}
              />
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={540}
      styles={{ body: { padding: 0 } }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: '#eef2ff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#4f46e5', fontSize: 15, flexShrink: 0,
          }}>
            <TableOutlined />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', lineHeight: 1.3 }}>
              {lookup.name}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>
              {lookup.lookupId}
            </div>
          </div>
        </div>
      }
      extra={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Popconfirm
            title="Delete this lookup?"
            description="All versions will be permanently deleted."
            onConfirm={handleDelete}
            okText="Delete" okButtonProps={{ danger: true }}
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={tab => { setActiveTab(tab); if (tab !== 'history') setAddVersionOpen(false); }}
        size="small"
        style={{ padding: '0 24px' }}
        items={[
          {
            key: 'info',
            label: (
              <span style={{ fontWeight: 500, fontSize: 13 }}>
                <InfoCircleOutlined style={{ marginRight: 5 }} />Info
              </span>
            ),
            children: (
              <div style={{ padding: '0 0 24px' }}>

                {/* Core metadata */}
                <div style={{ marginBottom: 4 }}>
                  <InfoRow label="Name">{lookup.name}</InfoRow>
                  <InfoRow label="Identifier">
                    <Text code style={{ fontSize: 12, background: '#f1f5f9', borderColor: '#e2e8f0' }}>
                      {lookup.lookupId}
                    </Text>
                  </InfoRow>
                  <InfoRow label="Active version">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text code style={{ fontSize: 12, background: '#f1f5f9', borderColor: '#e2e8f0' }}>
                        {activeVersion.version}
                      </Text>
                      <StatusBadge status={activeVersion.status} />
                    </div>
                  </InfoRow>
                  <InfoRow label="Type">
                    <Tag style={{ fontSize: 11, borderRadius: 5, margin: 0 }}>{lookup.type}</Tag>
                  </InfoRow>
                  {lookup.description && (
                    <InfoRow label="Description">
                      <Text style={{ fontSize: 13, color: '#475569' }}>{lookup.description}</Text>
                    </InfoRow>
                  )}
                  <InfoRow label={lookup.type === 'FILE' ? 'File' : 'Data'}>
                    <Button
                      size="small"
                      icon={<DownloadOutlined />}
                      loading={downloading}
                      onClick={handleDownload}
                      style={{ borderRadius: 6, fontWeight: 500, fontSize: 12 }}
                    >
                      {lookup.type === 'FILE' ? 'Download CSV' : 'Export CSV'}
                    </Button>
                  </InfoRow>
                  <InfoRow label="Created by">
                    <UserBadge name={lookup.createdBy} />
                  </InfoRow>
                  <InfoRow label="Created on">
                    <Text style={{ fontSize: 13 }}>{formatDate(lookup.createdAt)}</Text>
                  </InfoRow>
                  <InfoRow label="Last updated">
                    <Text style={{ fontSize: 13, color: '#64748b' }}>{formatDate(lookup.updatedAt)}</Text>
                  </InfoRow>
                </div>

                {/* Usage section */}
                <div style={{
                  marginTop: 24, background: '#f8fafc', borderRadius: 10,
                  border: '1px solid #e2e8f0', overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '10px 14px', borderBottom: '1px solid #e2e8f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Usage in Expressions
                    </Text>
                    <Tooltip title={copied ? 'Copied!' : 'Copy'}>
                      <Button
                        type="text" size="small"
                        icon={<CopyOutlined style={{ color: copied ? '#10b981' : '#94a3b8' }} />}
                        onClick={handleCopy}
                        style={{ padding: '0 4px' }}
                      />
                    </Tooltip>
                  </div>

                  <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <Text style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 5 }}>
                        Membership check (IN / NOT IN)
                      </Text>
                      <div style={{
                        background: '#1e293b', borderRadius: 7, padding: '9px 12px',
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#e2e8f0',
                        letterSpacing: '-0.01em',
                      }}>
                        <span style={{ color: '#94a3b8' }}>field </span>
                        <span style={{ color: '#a5b4fc' }}>IN </span>
                        <span style={{ color: '#fbbf24' }}>LOOKUP</span>
                        <span style={{ color: '#e2e8f0' }}>(</span>
                        <span style={{ color: '#34d399' }}>"{lookup.lookupId}"</span>
                        <span style={{ color: '#e2e8f0' }}>, </span>
                        <span style={{ color: '#94a3b8' }}>"column_name"</span>
                        <span style={{ color: '#e2e8f0' }}>)</span>
                      </div>
                    </div>

                    <div>
                      <Text style={{ fontSize: 11, color: '#94a3b8', display: 'block', marginBottom: 5 }}>
                        Exclusion
                      </Text>
                      <div style={{
                        background: '#1e293b', borderRadius: 7, padding: '9px 12px',
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#e2e8f0',
                        letterSpacing: '-0.01em',
                      }}>
                        <span style={{ color: '#94a3b8' }}>field </span>
                        <span style={{ color: '#a5b4fc' }}>NOT IN </span>
                        <span style={{ color: '#fbbf24' }}>LOOKUP</span>
                        <span style={{ color: '#e2e8f0' }}>(</span>
                        <span style={{ color: '#34d399' }}>"{lookup.lookupId}"</span>
                        <span style={{ color: '#e2e8f0' }}>, </span>
                        <span style={{ color: '#94a3b8' }}>"column_name"</span>
                        <span style={{ color: '#e2e8f0' }}>)</span>
                      </div>
                    </div>

                    <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      Replace <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>"column_name"</span> with the actual column header from your CSV.
                    </Text>
                  </div>
                </div>

              </div>
            ),
          },
          {
            key: 'history',
            label: (
              <span style={{ fontWeight: 500, fontSize: 13 }}>
                <HistoryOutlined style={{ marginRight: 5 }} />
                History
                {versions.length > 0 && (
                  <span style={{
                    marginLeft: 6, background: '#e2e8f0', color: '#475569',
                    borderRadius: 10, padding: '0 6px', fontSize: 11, fontWeight: 600,
                  }}>
                    {versions.length}
                  </span>
                )}
              </span>
            ),
            children: (
              <div style={{ padding: '0 0 24px' }}>

                {/* Upload new version panel */}
                {!addVersionOpen ? (
                  <div style={{ marginBottom: 16 }}>
                    <Button
                      icon={<UploadOutlined />}
                      onClick={() => setAddVersionOpen(true)}
                      style={{
                        borderRadius: 8, fontWeight: 500, fontSize: 13,
                        borderColor: '#c7d2fe', color: '#4f46e5', background: '#eef2ff',
                      }}
                    >
                      Upload New Version
                    </Button>
                  </div>
                ) : (
                  <div style={{
                    marginBottom: 20, background: '#f8fafc', borderRadius: 10,
                    border: '1px solid #e2e8f0', overflow: 'hidden',
                  }}>
                    {/* Panel header */}
                    <div style={{
                      padding: '10px 14px', borderBottom: '1px solid #e2e8f0',
                      background: '#f1f5f9',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <Text style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
                        Upload New Version
                      </Text>
                      <Button
                        type="text" size="small"
                        onClick={() => { setAddVersionOpen(false); setNvError(null); setNvFileList([]); setNvPct(0); }}
                        style={{ color: '#94a3b8', fontSize: 12 }}
                        disabled={nvUploading}
                      >
                        Cancel
                      </Button>
                    </div>

                    <div style={{ padding: 14 }}>
                      {nvError && (
                        <Alert type="error" message={nvError} showIcon closable
                          onClose={() => setNvError(null)}
                          style={{ marginBottom: 12, borderRadius: 8 }} />
                      )}

                      <div style={{ marginBottom: 12 }}>
                        <Text style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                          Version
                        </Text>
                        <Input
                          value={newVersion}
                          onChange={e => setNewVersion(e.target.value)}
                          disabled={nvUploading}
                          style={{ width: 120, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}
                        />
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <Text style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                          CSV File
                        </Text>
                        <Upload.Dragger
                          accept=".csv" maxCount={1} fileList={nvFileList}
                          beforeUpload={() => false}
                          onChange={({ fileList: fl }) => setNvFileList(fl)}
                          disabled={nvUploading}
                          style={{ borderRadius: 8 }}
                        >
                          <p className="ant-upload-drag-icon" style={{ marginBottom: 6 }}>
                            <InboxOutlined style={{ color: '#4f46e5', fontSize: 28 }} />
                          </p>
                          <p style={{ fontSize: 12, color: '#374151', margin: 0 }}>
                            <span style={{ color: '#4f46e5', fontWeight: 600 }}>Click</span> or drag CSV here
                          </p>
                        </Upload.Dragger>
                        {nvUploading && nvPct > 0 && (
                          <Progress
                            percent={nvPct} size="small"
                            status={nvPct === 100 ? 'success' : 'active'}
                            style={{ marginTop: 8 }}
                          />
                        )}
                      </div>

                      <Button
                        type="primary" onClick={handleAddVersion} loading={nvUploading}
                        style={{ borderRadius: 8, background: '#4f46e5', borderColor: '#4f46e5', fontWeight: 500 }}
                        block
                      >
                        Save Version
                      </Button>
                    </div>
                  </div>
                )}

                {/* Version history table */}
                <Spin spinning={versionsLoading}>
                  <Table
                    dataSource={versions}
                    columns={versionColumns}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    locale={{
                      emptyText: (
                        <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                          No version history
                        </div>
                      ),
                    }}
                  />
                </Spin>
              </div>
            ),
          },
        ]}
      />
    </Drawer>
  );
}

// ── Add Lookup Drawer ─────────────────────────────────────────────────────────

interface AddDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function AddLookupDrawer({ open, onClose, onCreated }: AddDrawerProps) {
  const [name, setName]               = useState('');
  const [identifier, setIdentifier]   = useState('');
  const [identifierTouched, setIdentifierTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [version, setVersion]         = useState('v1');
  const [fileList, setFileList]       = useState<UploadFile[]>([]);
  const [uploading, setUploading]     = useState(false);
  const [uploadPct, setUploadPct]     = useState(0);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const reset = () => {
    setName(''); setIdentifier(''); setIdentifierTouched(false);
    setDescription(''); setVersion('v1'); setFileList([]);
    setUploading(false); setUploadPct(0); setSaving(false); setError(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleNameChange = (v: string) => {
    setName(v);
    if (!identifierTouched) setIdentifier(toSlug(v));
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim())       { setError('Name is required'); return; }
    if (!identifier.trim()) { setError('Identifier is required'); return; }
    if (!version.trim())    { setError('Version is required'); return; }
    if (fileList.length === 0 || !fileList[0].originFileObj) {
      setError('Please select a CSV file'); return;
    }

    try {
      setUploading(true);
      setUploadPct(30);
      const upload = await uploadLookupFile(
        fileList[0].originFileObj as File,
        identifier,
        version,
      );
      setUploadPct(70);

      setSaving(true);
      await saveLookup({
        lookupId: identifier,
        version,
        name: name.trim(),
        description: description.trim() || undefined,
        lookup: { type: 'FILE', fileRef: upload.fileRef, format: 'CSV', columns: upload.columns },
      });
      setUploadPct(100);

      message.success('Lookup table created');
      reset();
      onCreated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create lookup');
    } finally {
      setUploading(false);
      setSaving(false);
    }
  };

  const busy = uploading || saving;

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, background: '#eef2ff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#4f46e5', fontSize: 14,
          }}>
            <TableOutlined />
          </div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Add Lookup Table</span>
        </div>
      }
      open={open}
      onClose={handleClose}
      width={480}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={handleClose} disabled={busy}>Cancel</Button>
          <Button type="primary" onClick={handleSave} loading={busy}
            style={{ background: '#4f46e5', borderColor: '#4f46e5' }}>
            Save
          </Button>
        </div>
      }
    >
      {error && (
        <Alert type="error" message={error} showIcon closable
          onClose={() => setError(null)} style={{ marginBottom: 20 }} />
      )}

      <Form layout="vertical" requiredMark={false}>
        <Form.Item label={<span style={{ fontWeight: 600, fontSize: 13 }}>Name</span>} required>
          <Input placeholder="Enter name" value={name}
            onChange={e => handleNameChange(e.target.value)} disabled={busy} />
        </Form.Item>

        <Form.Item
          label={
            <span style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
              Identifier
              <Tooltip title="Used in policy expressions to reference this lookup. Auto-generated from name, but can be customised.">
                <InfoCircleOutlined style={{ color: '#94a3b8', fontSize: 12 }} />
              </Tooltip>
            </span>
          }
          required
        >
          <Input placeholder="Enter alias" value={identifier}
            onChange={e => { setIdentifier(e.target.value); setIdentifierTouched(true); }}
            disabled={busy} style={{ fontFamily: "'JetBrains Mono', monospace" }} />
        </Form.Item>

        <Form.Item label={<span style={{ fontWeight: 600, fontSize: 13 }}>Description</span>}>
          <Input.TextArea placeholder="Enter description" rows={2}
            value={description} onChange={e => setDescription(e.target.value)} disabled={busy} />
        </Form.Item>

        <Form.Item label={<span style={{ fontWeight: 600, fontSize: 13 }}>Version</span>} required>
          <Input value={version} onChange={e => setVersion(e.target.value)}
            disabled={busy} style={{ width: 100 }} />
        </Form.Item>

        <Form.Item label={<span style={{ fontWeight: 600, fontSize: 13 }}>File</span>} required>
          <Dragger
            accept=".csv" maxCount={1} fileList={fileList}
            beforeUpload={() => false}
            onChange={({ fileList: fl }) => setFileList(fl)}
            disabled={busy} style={{ borderRadius: 8 }}
          >
            <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
              <InboxOutlined style={{ color: '#4f46e5', fontSize: 32 }} />
            </p>
            <p style={{ fontSize: 13, color: '#374151', margin: 0 }}>
              <span style={{ color: '#4f46e5', fontWeight: 600 }}>Click to Upload</span>
              {' '}or drag and drop
            </p>
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>CSV (max. 30 MB)</p>
          </Dragger>

          {(uploading || saving) && uploadPct > 0 && (
            <Progress
              percent={uploadPct} size="small"
              status={uploadPct === 100 ? 'success' : 'active'}
              style={{ marginTop: 10 }}
            />
          )}
        </Form.Item>
      </Form>
    </Drawer>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function LookupList() {
  const [rows, setRows]                       = useState<LookupSummary[]>([]);
  const [total, setTotal]                     = useState(0);
  const [page, setPage]                       = useState(0);
  const [tableLoading, setTableLoading]       = useState(true);
  const [tableError, setTableError]           = useState<string | null>(null);
  const [search, setSearch]                   = useState('');
  const [addDrawerOpen, setAddDrawerOpen]     = useState(false);
  const [detailLookup, setDetailLookup]       = useState<LookupSummary | null>(null);

  const loadPage = (p: number) => {
    setTableLoading(true);
    setTableError(null);
    fetchLookupsPage(p, PAGE_SIZE)
      .then(data => {
        setRows(data.content);
        setTotal(data.totalElements);
        setPage(data.number ?? p);
      })
      .catch((e: Error) => setTableError(e.message))
      .finally(() => setTableLoading(false));
  };

  useEffect(() => { loadPage(0); }, []);

  const handleTableChange = (pagination: TablePaginationConfig) => {
    loadPage((pagination.current ?? 1) - 1);
  };

  const handleDelete = async (lookupId: string) => {
    try {
      await deleteLookup(lookupId);
      message.success('Lookup deleted');
      loadPage(page);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const visible = search.trim()
    ? rows.filter(r =>
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.lookupId.toLowerCase().includes(search.toLowerCase()),
      )
    : rows;

  const columns: ColumnsType<LookupSummary> = [
    {
      title: 'Source Name',
      key: 'name',
      render: (_: unknown, row: LookupSummary) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8, flexShrink: 0,
            background: '#eef2ff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#4f46e5', fontSize: 15,
          }}>
            <TableOutlined />
          </div>
          <div>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{row.name}</div>
            {row.description && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{row.description}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'Alias',
      dataIndex: 'lookupId',
      key: 'lookupId',
      render: (v: string) => (
        <Text code style={{ fontSize: 12, background: '#f1f5f9', borderColor: '#e2e8f0' }}>{v}</Text>
      ),
    },
    {
      title: 'Version',
      dataIndex: 'version',
      key: 'version',
      render: (v: string) => (
        <Text code style={{ fontSize: 11, background: '#f1f5f9', borderColor: '#e2e8f0' }}>{v}</Text>
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
      render: (_: unknown, row: LookupSummary) => (
        <div onClick={e => e.stopPropagation()}>
          <Popconfirm
            title="Delete lookup?"
            description={`This will permanently delete all versions of "${row.name}".`}
            onConfirm={() => handleDelete(row.lookupId)}
            okText="Delete" okButtonProps={{ danger: true }} cancelText="Cancel"
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1200 }}>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <Title level={4} style={{ margin: 0, color: '#0f172a', fontWeight: 700 }}>Lookup Tables</Title>
        <Text style={{ color: '#64748b', fontSize: 13 }}>
          Upload and manage CSV lookup tables referenced in your policies
        </Text>
      </div>

      {/* Table card */}
      <div style={{
        background: '#fff', borderRadius: 14,
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        {/* Toolbar */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #f1f5f9',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="Filter by name or alias…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 260, borderRadius: 8 }}
            allowClear
          />
          <div style={{ flex: 1 }} />
          <Button
            type="primary" icon={<PlusOutlined />}
            onClick={() => setAddDrawerOpen(true)}
            style={{ borderRadius: 8, fontWeight: 500, background: '#4f46e5', borderColor: '#4f46e5' }}
          >
            Add Lookup
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
            onChange={handleTableChange}
            onRow={row => ({
              onClick: () => setDetailLookup(row),
              style: { cursor: 'pointer' },
            })}
            rowClassName={() => 'lookup-row'}
            pagination={{
              current: page + 1,
              pageSize: PAGE_SIZE,
              total,
              showTotal: (t, range) => `${range[0]}–${range[1]} of ${t} lookups`,
              showSizeChanger: false,
            }}
            size="middle"
            locale={{
              emptyText: (
                <div style={{ padding: '48px 0', textAlign: 'center' }}>
                  <TableOutlined style={{ fontSize: 36, color: '#cbd5e1', marginBottom: 12 }} />
                  <div style={{ color: '#94a3b8', fontSize: 14 }}>No lookup tables yet</div>
                  <Button
                    type="primary" icon={<PlusOutlined />}
                    style={{ marginTop: 16 }}
                    onClick={() => setAddDrawerOpen(true)}
                  >
                    Add your first lookup
                  </Button>
                </div>
              ),
            }}
          />
        </Spin>
      </div>

      {/* Add drawer */}
      <AddLookupDrawer
        open={addDrawerOpen}
        onClose={() => setAddDrawerOpen(false)}
        onCreated={() => { setAddDrawerOpen(false); loadPage(0); }}
      />

      {/* Detail drawer */}
      <LookupDetailDrawer
        lookup={detailLookup}
        open={!!detailLookup}
        onClose={() => setDetailLookup(null)}
        onDeleted={() => loadPage(page)}
      />
    </div>
  );
}
