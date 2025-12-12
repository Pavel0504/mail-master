import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase, User } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('login', username)
      .eq('password', password)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Неверный логин или пароль');

    setUser(data);
    localStorage.setItem('user', JSON.stringify(data));

    await supabase.from('activity_logs').insert({
      user_id: data.id,
      action_type: 'login',
      entity_type: 'user',
      entity_id: data.id,
      details: {}
    });
  };

  const logout = () => {
    if (user) {
      supabase.from('activity_logs').insert({
        user_id: user.id,
        action_type: 'logout',
        entity_type: 'user',
        entity_id: user.id,
        details: {}
      });
    }
    setUser(null);
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
