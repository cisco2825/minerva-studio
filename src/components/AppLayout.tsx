import { Layout, Menu, Typography } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  ThunderboltFilled,
  FileTextOutlined,
  PlusCircleOutlined,
} from '@ant-design/icons';

const { Sider, Content } = Layout;
const { Text } = Typography;

const SIDEBAR_BG = '#13112b';
const SIDEBAR_BORDER = 'rgba(255,255,255,0.06)';

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedKey = location.pathname === '/' ? 'policies' : location.pathname;

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
              Axiom
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
              Rule Engine
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
            ]}
          />
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: `1px solid ${SIDEBAR_BORDER}`,
          }}
        >
          <Text style={{ color: '#334155', fontSize: 11 }}>v0.1.0 — dev</Text>
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
