import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { AuthUser } from '../types';
import { apiMe } from '../api/client';

// ── Token helpers ─────────────────────────────────────────────────────────────

const TOKEN_KEY = 'axiom_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// ── Context ───────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]     = useState<AuthUser | null>(null);
  const [token, setToken]   = useState<string | null>(getStoredToken);
  const [loading, setLoading] = useState(true);   // true while verifying stored token

  // On mount: if there's a token in localStorage, verify it against /me
  useEffect(() => {
    const storedToken = getStoredToken();
    if (!storedToken) {
      setLoading(false);
      return;
    }
    apiMe()
      .then(res => {
        setStoredToken(res.token);   // refresh token
        setToken(res.token);
        setUser({ id: res.id, email: res.email, name: res.name });
      })
      .catch(() => {
        // Token invalid / expired — clear it
        clearStoredToken();
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const setAuth = useCallback((newToken: string, newUser: AuthUser) => {
    setStoredToken(newToken);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, setAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
