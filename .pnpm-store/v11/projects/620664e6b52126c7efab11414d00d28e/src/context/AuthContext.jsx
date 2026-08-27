import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import API from '../services/api';
import { hasModuleAccess } from '../access';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('melann_user')); } catch { return null; }
  });

  const refreshUser = useCallback(async () => {
    const { data } = await API.get('/auth/me');
    localStorage.setItem('melann_user', JSON.stringify(data));
    setUser(data);
    return data;
  }, []);

  useEffect(() => {
    // A logged-out visitor does not need /auth/me. Calling it from /login
    // returns 401 by design and previously caused a continuous page reload.
    if (localStorage.getItem('melann_user')) {
      refreshUser().catch(() => {});
    }
  }, [refreshUser]);

  const login = useCallback(async (username, password) => {
    const { data } = await API.post('/auth/login', { username, password });
    localStorage.setItem('melann_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await API.post('/auth/logout').catch(() => {});
    localStorage.removeItem('melann_user');
    setUser(null);
  }, []);

  const hasRole = useCallback((...roles) => user && roles.includes(user.role), [user]);
  const hasPermission = useCallback((moduleKey, action = 'view') => hasModuleAccess(user, moduleKey, action), [user]);

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser, hasRole, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
