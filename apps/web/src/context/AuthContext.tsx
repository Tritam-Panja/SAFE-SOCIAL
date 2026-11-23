import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserRole, AgeGroup, UserSummary } from '@fizzy/shared-types';
import { apiClient } from '../services/api';

export interface ChildSafetyControls {
  isPaused?: boolean;
  pauseReason?: string | null;
  canComment?: boolean;
  canAddFriends?: boolean;
  canReceiveFriendRequests?: boolean;
  requireParentApprovalForFriends?: boolean;
  canCreateContent?: boolean;
  canWatchShortsReels?: boolean;
  dailyLimitMinutes?: number;
  bedtimeStartHour?: number | null;
  bedtimeEndHour?: number | null;
}

interface AuthContextType {
  user: UserSummary | null;
  role: UserRole | null;
  ageGroup: AgeGroup | null;
  safetyControls: ChildSafetyControls | null;
  updateSafetyControls: (newControls: Partial<ChildSafetyControls>) => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (userData: UserSummary, token?: string) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [safetyControls, setSafetyControls] = useState<ChildSafetyControls | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const res = await apiClient.get('/auth/me');
      if (res.data?.success && res.data?.data) {
        const u = res.data.data;
        setUser(u);
        if (u.childProfile?.parentControls) {
          setSafetyControls(u.childProfile.parentControls);
        } else if (u.childProfile?.id) {
          // Fallback fetch if not embedded
          setSafetyControls(null);
        }
      } else {
        setUser(null);
        setSafetyControls(null);
      }
    } catch {
      setUser(null);
      setSafetyControls(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = (userData: UserSummary, token?: string) => {
    setUser(userData);
    if (token) {
      localStorage.setItem('fizzy_session_token', token);
    }
    if ((userData as any).childProfile?.parentControls) {
      setSafetyControls((userData as any).childProfile.parentControls);
    }
  };

  const updateSafetyControls = (newControls: Partial<ChildSafetyControls>) => {
    setSafetyControls((prev) => ({
      ...(prev || {}),
      ...newControls,
    }));
  };

  const logout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      localStorage.removeItem('fizzy_session_token');
      setUser(null);
      setSafetyControls(null);
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
        safetyControls,
        updateSafetyControls,
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
