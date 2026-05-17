import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppLayout from './components/AppLayout';
import PolicyList from './pages/PolicyList';
import PolicyDetail from './pages/PolicyDetail';
import PolicyEditor from './pages/PolicyEditor';
import DecisionTableEditor from './pages/DecisionTableEditor';
import ScorecardEditor from './pages/ScorecardEditor';
import LookupList from './pages/LookupList';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

// ── Route guard ───────────────────────────────────────────────────────────────
// While the stored token is being verified, show a centered spinner.
// Once resolved, either render children or redirect to /login.

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

// ── Guest-only guard (redirect to / if already logged in) ─────────────────────

function GuestRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" replace /> : <>{children}</>;
}

// ── App routes ────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Routes>
      {/* Auth pages — no sidebar, redirect away if already logged in */}
      <Route path="/login"           element={<GuestRoute><LoginPage /></GuestRoute>} />
      <Route path="/signup"          element={<GuestRoute><SignupPage /></GuestRoute>} />
      <Route path="/forgot-password" element={<GuestRoute><ForgotPasswordPage /></GuestRoute>} />
      {/* Reset password carries a token param — always public */}
      <Route path="/reset-password"  element={<ResetPasswordPage />} />

      {/* Pages inside the sidebar shell — require auth */}
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/" element={<PolicyList />} />
        <Route path="/policies/:policyId" element={<PolicyDetail />} />
        <Route path="/lookups" element={<LookupList />} />
      </Route>

      {/* Full-screen editors — require auth, no sidebar */}
      <Route path="/policies/new"          element={<ProtectedRoute><PolicyEditor /></ProtectedRoute>} />
      <Route path="/editor/decision-table" element={<ProtectedRoute><DecisionTableEditor /></ProtectedRoute>} />
      <Route path="/editor/scorecard"      element={<ProtectedRoute><ScorecardEditor /></ProtectedRoute>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
