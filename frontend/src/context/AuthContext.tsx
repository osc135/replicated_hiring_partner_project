import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import * as api from '../api';

interface AuthState {
  user: string | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user_email');
    if (savedToken) {
      setToken(savedToken);
      setUser(savedUser);
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    const accessToken = res.access_token ?? res.token ?? '';
    localStorage.setItem('token', accessToken);
    localStorage.setItem('user_email', email);
    setToken(accessToken);
    setUser(email);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const res = await api.register(email, password);
    const accessToken = res.access_token ?? res.token ?? '';
    localStorage.setItem('token', accessToken);
    localStorage.setItem('user_email', email);
    setToken(accessToken);
    setUser(email);
  }, []);

  const logout = useCallback(() => {
    api.logout();
    localStorage.removeItem('token');
    localStorage.removeItem('user_email');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
