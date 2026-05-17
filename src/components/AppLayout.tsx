import { Layout, Menu, Typography, Popconfirm, Tooltip } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  ThunderboltFilled,
  FileTextOutlined,
  PlusCircleOutlined,
  DatabaseOutlined,
  TableOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';

const { Sider, Content } = Layout;
const { Text } = Typography;

const SIDEBAR_BG = '#13112b';
const SIDEBAR_BORDER = 'rgba(255,255,255,0.06)';

export default function AppLayout() {
  const navigate       = useNavigate();
  const location       = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const selectedKey = location.pathname === '/'
    ? 'policies'
    : location.pathname.startsWith('/lookups') ? '/lookups'
    : location.pathname;

  return (
    <Layout style={{ minHeight: '100vh', fontFamily: 'inherit' }}>
      {/* ── Sidebar ── */}
      <Sider
        width={228}
        style={{
          background: SIDEBAR_BG,
          borderRight: `1px solid ${SIDEBAR_BORDER}`,
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0,
          left: 0,
          height: '100vh',
          zIndex: 100,
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: '24px 20px 20px',
            borderBottom: `1px solid ${SIDEBAR_BORDER}`,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            cursor: 'pointer',
          }}
          onClick={() => navigate('/')}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(99,102,241,0.45)',
            }}
          >
            <ThunderboltFilled style={{ color: '#fff', fontSize: 17 }} />
          </div>
          <div>
            <Text
              style={{
                color: '#f1f5f9',
                fontWeight: 800,
                fontSize: 17,
                letterSpacing: '-0.4px',
                display: 'block',
                lineHeight: 1.2,
              }}
            >
              Minerva
            </Text>
            <Text
              style={{
                color: '#475569',
                fontSize: 10,
                display: 'block',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
              }}
            >
              Decision Engine
            </Text>
          </div>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, padding: '12px 0' }}>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            style={{
              background: 'transparent',
              borderRight: 0,
              fontSize: 13,
            }}
            items={[
              {
                key: 'policies',
                icon: <FileTextOutlined />,
                label: 'Policies',
                onClick: () => navigate('/'),
              },
              {
                key: 'new',
                icon: <PlusCircleOutlined />,
                label: 'New Policy',
                onClick: () => navigate('/policies/new'),
              },
              { type: 'divider' },
              {
                key: 'data-sources-group',
                icon: <DatabaseOutlined />,
                label: 'Data Sources',
                children: [
                  {
                    key: '/lookups',
                    icon: <TableOutlined />,
                    label: 'Lookup Tables',
                    onClick: () => navigate('/lookups'),
                  },
                ],
              },
            ]}
          />
        </div>

        {/* Footer — user info + logout */}
        <div style={{
          padding: '12px 16px',
          borderTop: `1px solid ${SIDEBAR_BORDER}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          {/* Avatar */}
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 11, fontWeight: 700,
          }}>
            {user?.name?.slice(0, 2).toUpperCase() ?? '??'}
          </div>
          {/* Name + email */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.name}
            </Text>
            <Text style={{ color: '#475569', fontSize: 10, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email}
            </Text>
          </div>
          {/* Logout */}
          <Popconfirm
            title="Sign out?"
            onConfirm={handleLogout}
            okText="Yes" cancelText="No"
            placement="topRight"
          >
            <Tooltip title="Sign out" placement="right">
              <LogoutOutlined style={{ color: '#475569', fontSize: 14, cursor: 'pointer', flexShrink: 0 }} />
            </Tooltip>
          </Popconfirm>
        </div>
      </Sider>

      {/* ── Main content (offset by sidebar width) ── */}
      <Layout style={{ marginLeft: 228, minHeight: '100vh', background: '#f1f5f9' }}>
        <Content style={{ minHeight: '100vh' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
