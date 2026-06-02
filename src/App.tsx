import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppLayout from './components/AppLayout';
import PolicyList from './pages/PolicyList';
import PolicyDetail from './pages/PolicyDetail';
import PolicyEditor from './pages/PolicyEditor';
import DecisionTableEditor from './pages/DecisionTableEditor';
import ScorecardEditor from './pages/ScorecardEditor';
import LookupList from './pages/LookupList';
import ExpressionReferencePage from './pages/ExpressionReferencePage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

// ── Route guards ──────────────────────────────────────────────────────────────

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#f1f5f9',
      }}>
        <Spin size="large" />
      </div>
    );
  }
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" replace /> : <>{children}</>;
}

// ── Router (data router — required for useBlocker) ────────────────────────────

const router = createBrowserRouter([
  // Auth pages — redirect away if already logged in
  { path: '/login',           element: <GuestRoute><LoginPage /></GuestRoute> },
  { path: '/signup',          element: <GuestRoute><SignupPage /></GuestRoute> },
  { path: '/forgot-password', element: <GuestRoute><ForgotPasswordPage /></GuestRoute> },
  // Reset password carries a token param — always public
  { path: '/reset-password',  element: <ResetPasswordPage /> },

  // Pages inside the sidebar shell — require auth
  {
    element: <ProtectedRoute><AppLayout /></ProtectedRoute>,
    children: [
      { path: '/',                   element: <PolicyList /> },
      { path: '/policies/:policyId', element: <PolicyDetail /> },
      { path: '/lookups',            element: <LookupList /> },
      { path: '/docs/expressions',   element: <ExpressionReferencePage /> },
    ],
  },

  // Full-screen editors — require auth, no sidebar
  { path: '/policies/new',          element: <ProtectedRoute><PolicyEditor /></ProtectedRoute> },
  { path: '/editor/decision-table', element: <ProtectedRoute><DecisionTableEditor /></ProtectedRoute> },
  { path: '/editor/scorecard',      element: <ProtectedRoute><ScorecardEditor /></ProtectedRoute> },

  // Fallback
  { path: '*', element: <Navigate to="/" replace /> },
]);

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
