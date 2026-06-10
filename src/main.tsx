import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import 'reactflow/dist/style.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#6366f1',
          colorSuccess: '#10b981',
          colorWarning: '#f59e0b',
          colorError: '#ef4444',
          colorInfo: '#6366f1',
          borderRadius: 8,
          fontFamily:
            '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          colorBgContainer: '#ffffff',
          colorBgLayout: '#f1f5f9',
          colorBorder: '#e2e8f0',
          colorTextBase: '#0f172a',
          boxShadow:
            '0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1)',
        },
        components: {
          Table: {
            headerBg: '#f8fafc',
            rowHoverBg: '#f8fafc',
            borderColor: '#e2e8f0',
          },
          Menu: {
            darkItemBg: 'transparent',
            darkSubMenuItemBg: 'transparent',
            darkItemSelectedBg: 'rgba(99,102,241,0.18)',
            darkItemSelectedColor: '#a5b4fc',
            darkItemColor: '#94a3b8',
            darkItemHoverColor: '#e2e8f0',
          },
          Tabs: {
            inkBarColor: '#6366f1',
            itemSelectedColor: '#6366f1',
          },
          Tag: {
            borderRadiusSM: 6,
          },
        },
      }}
    >
      <App />
    </ConfigProvider>,
);
