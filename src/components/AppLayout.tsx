import { useState } from 'react';
import { Layout, Menu, Typography, Popconfirm, Tooltip } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  ThunderboltFilled,
  FileTextOutlined,
  PlusCircleOutlined,
  DatabaseOutlined,
  TableOutlined,
  LogoutOutlined,
  ReadOutlined,
  MenuFoldOutlined,
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';

const { Sider, Content } = Layout;
const { Text } = Typography;

const SIDEBAR_BG     = '#13112b';
const SIDEBAR_BORDER = 'rgba(255,255,255,0.06)';
const EXPANDED_W     = 228;
const COLLAPSED_W    = 64;

export default function AppLayout() {
  const navigate           = useNavigate();
  const location           = useLocation();
  const { user, logout }   = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const sidebarW = collapsed ? COLLAPSED_W : EXPANDED_W;

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

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <Sider
        collapsed={collapsed}
        collapsedWidth={COLLAPSED_W}
        width={EXPANDED_W}
        trigger={null}
        style={{
          background: SIDEBAR_BG,
          borderRight: `1px solid ${SIDEBAR_BORDER}`,
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0, left: 0,
          height: '100vh',
          zIndex: 100,
          transition: 'width 0.2s ease',
          overflow: 'hidden',
        }}
      >
        {/* Logo + collapse toggle */}
        <div style={{
          padding: '0 15px',
          height: 64,
          borderBottom: `1px solid ${SIDEBAR_BORDER}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 10,
          flexShrink: 0,
        }}>
          {collapsed ? (
            // Collapsed: bolt icon only, clicking it expands
            <Tooltip title="Expand sidebar" placement="right">
              <div
                onClick={() => setCollapsed(false)}
                style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(99,102,241,0.45)',
                  cursor: 'pointer',
                }}
              >
                <ThunderboltFilled style={{ color: '#fff', fontSize: 17 }} />
              </div>
            </Tooltip>
          ) : (
            // Expanded: logo on the left, collapse button on the right
            <>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, cursor: 'pointer' }}
                onClick={() => navigate('/')}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(99,102,241,0.45)',
                }}>
                  <ThunderboltFilled style={{ color: '#fff', fontSize: 17 }} />
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <Text style={{ color: '#f1f5f9', fontWeight: 800, fontSize: 17, letterSpacing: '-0.4px', display: 'block', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                    Minerva
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 10, display: 'block', letterSpacing: '0.5px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    Decision Engine
                  </Text>
                </div>
              </div>

              <Tooltip title="Collapse sidebar" placement="right">
                <button
                  onClick={() => setCollapsed(true)}
                  style={{
                    flexShrink: 0, width: 28, height: 28, borderRadius: 6,
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#334155', fontSize: 14,
                    transition: 'background 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#94a3b8'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#334155'; }}
                >
                  <MenuFoldOutlined />
                </button>
              </Tooltip>
            </>
          )}
        </div>

        {/* Nav */}
        <div style={{ flex: 1, padding: '12px 0', overflowX: 'hidden', overflowY: 'auto' }}>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            inlineCollapsed={collapsed}
            style={{ background: 'transparent', borderRight: 0, fontSize: 13 }}
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
              { type: 'divider' },
              {
                key: 'help-group',
                icon: <ReadOutlined />,
                label: 'Help',
                children: [
                  {
                    key: '/docs/expressions',
                    icon: <ReadOutlined />,
                    label: 'Expression Reference',
                    onClick: () => navigate('/docs/expressions'),
                  },
                ],
              },
            ]}
          />
        </div>

        {/* Footer — user info + logout */}
        <div style={{
          padding: collapsed ? '12px 0' : '12px 16px',
          borderTop: `1px solid ${SIDEBAR_BORDER}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: collapsed ? 0 : 10,
          transition: 'padding 0.2s ease',
        }}>
          <Tooltip title={collapsed ? `${user?.name} · ${user?.email}` : ''} placement="right">
            <div style={{
              width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 11, fontWeight: 700, cursor: collapsed ? 'default' : 'auto',
            }}>
              {user?.name?.slice(0, 2).toUpperCase() ?? '??'}
            </div>
          </Tooltip>

          {!collapsed && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.name}
                </Text>
                <Text style={{ color: '#475569', fontSize: 10, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.email}
                </Text>
              </div>
              <Popconfirm title="Sign out?" onConfirm={handleLogout} okText="Yes" cancelText="No" placement="topRight">
                <Tooltip title="Sign out" placement="right">
                  <LogoutOutlined style={{ color: '#475569', fontSize: 14, cursor: 'pointer', flexShrink: 0 }} />
                </Tooltip>
              </Popconfirm>
            </>
          )}
        </div>

      </Sider>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <Layout style={{
        marginLeft: sidebarW,
        minHeight: '100vh',
        background: '#f1f5f9',
        transition: 'margin-left 0.2s ease',
      }}>
        <Content style={{ minHeight: '100vh' }}>
          <Outlet />
        </Content>
      </Layout>

    </Layout>
  );
}
