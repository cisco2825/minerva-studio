import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Tag, Typography, Space, Alert, Spin, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { fetchPolicies } from '../api/client';
import type { PolicySummary, PolicyType, PolicyStatus } from '../types';

const { Title, Text } = Typography;

const TYPE_COLORS: Record<PolicyType, string> = {
  RULE_CHAIN: 'blue',
  DECISION_TABLE: 'purple',
  SCORECARD: 'cyan',
};

const STATUS_COLORS: Record<PolicyStatus, string> = {
  DRAFT: 'default',
  ACTIVE: 'success',
  INACTIVE: 'warning',
  ARCHIVED: 'error',
};

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

export default function PolicyList() {
  const [rows, setRows] = useState<PolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPolicies()
      .then((data) => setRows(groupPolicies(data)))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const columns: ColumnsType<PolicyRow> = [
    {
      title: 'Policy ID',
      dataIndex: 'policyId',
      key: 'policyId',
      render: (id: string) => (
        <a onClick={() => navigate(`/policies/${id}`)} style={{ fontFamily: 'monospace' }}>
          {id}
        </a>
      ),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (t: PolicyType) => (
        <Tag color={TYPE_COLORS[t]}>{t.replace('_', ' ')}</Tag>
      ),
    },
    {
      title: 'Latest Version',
      dataIndex: 'latestVersion',
      key: 'latestVersion',
      render: (v: string) => <Text code>{v}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'latestStatus',
      key: 'latestStatus',
      render: (s: PolicyStatus) => <Tag color={STATUS_COLORS[s]}>{s}</Tag>,
    },
    {
      title: 'Versions',
      dataIndex: 'versionCount',
      key: 'versionCount',
      align: 'center',
      render: (n: number) => <Text type="secondary">{n}</Text>,
    },
    {
      title: 'Last Updated',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (t: string) => <Text type="secondary">{new Date(t).toLocaleString()}</Text>,
    },
    {
      title: 'Created By',
      dataIndex: 'createdBy',
      key: 'createdBy',
      render: (v?: string) => <Text type="secondary">{v ?? '—'}</Text>,
    },
  ];

  return (
    <div style={{ padding: '32px 40px' }}>
      <Space direction="vertical" size={24} style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>Policies</Title>
            <Text type="secondary">All stored policies across versions</Text>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/policies/new')}
          >
            New Policy
          </Button>
        </div>

        {error && <Alert type="error" message={error} showIcon />}

        <Spin spinning={loading}>
          <Table
            dataSource={rows}
            columns={columns}
            rowKey="policyId"
            onRow={(row) => ({ onClick: () => navigate(`/policies/${row.policyId}`) })}
            rowClassName={() => 'clickable-row'}
            pagination={{ pageSize: 20, hideOnSinglePage: true }}
            size="middle"
          />
        </Spin>
      </Space>
    </div>
  );
}
