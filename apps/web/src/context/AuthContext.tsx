import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserRole, AgeGroup, UserSummary } from '@fizzy/shared-types';
import { apiClient } from '../services/api';

interface AuthContextType {
  user: UserSummary | null;
  role: UserRole | null;
  ageGroup: AgeGroup | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (userData: UserSummary) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const res = await apiClient.get('/auth/me');
      if (res.data?.success && res.data?.data) {
        setUser(res.data.data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = (userData: UserSummary) => {
    setUser(userData);
  };

  const logout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      setUser(null);
    }
  };

  const role = user?.role || null;
  const ageGroup = user?.ageGroup || null;

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        ageGroup,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
