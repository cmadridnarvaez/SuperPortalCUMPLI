import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { authApi, User } from '@/api/super';
import { api, setAccessToken } from '@/api/client';

// Auth del Superportal: igual mecánica que la app principal (access en
// memoria + refresh en cookie httpOnly), pero SOLO admite rol SuperAdmin.
// Un admin de tenant (AdminGRC) no puede entrar a la consola de operación.

interface AuthState {
  user: User | null;
  loading: boolean;
  errorRol: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorRol, setErrorRol] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    try {
      const { data } = await api.post<{ access_token: string }>('/auth/refresh', {}, { withCredentials: true });
      setAccessToken(data.access_token);
      const me = await authApi.me();
      if (me.rol !== 'SuperAdmin') {
        setAccessToken(null);
        setUser(null);
        setErrorRol('Esta consola es exclusiva del equipo TitanStudio (SuperAdmin).');
      } else {
        setUser(me);
      }
    } catch {
      setAccessToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  const login = useCallback(async (username: string, password: string) => {
    const { access_token, user: u } = await authApi.login(username, password);
    if (u.rol !== 'SuperAdmin') {
      // cerrar la sesión recién creada: la cookie de refresh no debe quedar
      try { await authApi.logout(); } catch { /* ignore */ }
      throw { response: { data: { msg: 'Esta consola es exclusiva del equipo TitanStudio (SuperAdmin).' } } };
    }
    setAccessToken(access_token);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, errorRol, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
