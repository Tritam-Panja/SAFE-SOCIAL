import React, { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Home,
  Compass,
  Film,
  PlusCircle,
  ShieldCheck,
  UserCheck,
  Bell,
  LogIn,
  LogOut,
  User,
  Users,
  Layers,
  Settings,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { apiClient } from '../services/api';
import { UserRole, RealtimeEvent } from '@fizzy/shared-types';

export const AppLayout: React.FC = () => {
  const { user, role, ageGroup, safetyControls, updateSafetyControls, isAuthenticated, logout } = useAuth();
  const { isConnected, on } = useRealtime();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Query unread notification count
  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await apiClient.get('/notifications?limit=1');
      return res.data;
    },
    enabled: isAuthenticated,
  });

  const unreadCount = notifData?.meta?.unreadCount || 0;

  // Listen for live parent control changes and notification events
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubNotif = on(RealtimeEvent.NOTIFICATION_CREATED, (payload) => {
      console.log('[AppLayout] New notification arrived in real-time:', payload.title);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    const unsubParentControl = on<any>(RealtimeEvent.PARENT_CONTROL_UPDATED, (payload) => {
      console.log('[AppLayout] Parent control updated live:', payload);
      if (payload?.settings) {
        updateSafetyControls(payload.settings);
        queryClient.invalidateQueries({ queryKey: ['feed'] });
        queryClient.invalidateQueries({ queryKey: ['reels'] });
        queryClient.invalidateQueries({ queryKey: ['friends'] });
      }
    });

    return () => {
      unsubNotif();
      unsubParentControl();
    };
  }, [isAuthenticated, on, queryClient, updateSafetyControls]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* Top Banner & Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-lg">
            F
          </div>
          <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Fizzy
          </span>
          <span className="text-xs bg-purple-100 text-purple-700 font-semibold px-2 py-0.5 rounded-full ml-2">
            Safe Social
          </span>
          {isAuthenticated && (
            <span
              title={isConnected ? 'Real-time connected' : 'Connecting real-time...'}
              className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
                isConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}
            >
              {isConnected ? (
                <>
                  <Wifi className="w-3 h-3 text-emerald-500 animate-pulse" /> Live
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-amber-500" /> Offline
                </>
              )}
            </span>
          )}
        </div>

        {/* User Session Status */}
        <div className="flex items-center space-x-3 text-xs">
          {isAuthenticated && user ? (
            <div className="flex items-center space-x-2">
              <span className="bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 font-semibold text-slate-700 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-purple-600" />
                <span>@{user.username}</span>
                <span className="bg-purple-200 text-purple-800 text-[10px] px-1.5 py-0.2 rounded font-bold uppercase">
                  {role} {ageGroup && `• ${ageGroup}`}
                </span>
              </span>

              <button
                onClick={handleLogout}
                className="bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1 font-semibold flex items-center gap-1 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <NavLink
                to="/login"
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" /> Log In
              </NavLink>
              <NavLink
                to="/register"
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-1.5 rounded-lg transition-colors"
              >
                Register
              </NavLink>
            </div>
          )}
        </div>
      </header>

      {/* Navigation Sidebar (Desktop) */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-200 bg-white pt-16 px-4 space-y-2">
        <nav className="space-y-1 mt-4">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium transition-colors ${
                isActive
                  ? 'bg-purple-100 text-purple-800'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <Home className="w-5 h-5" />
            <span>Feed</span>
          </NavLink>

          <NavLink
            to="/explore"
            className={({ isActive }) =>
              `flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium transition-colors ${
                isActive
                  ? 'bg-purple-100 text-purple-800'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <Compass className="w-5 h-5" />
            <span>Explore</span>
          </NavLink>

          <NavLink
            to="/reels"
            className={({ isActive }) =>
              `flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium transition-colors ${
                isActive
                  ? 'bg-purple-100 text-purple-800'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <Film className="w-5 h-5" />
            <span>Reels</span>
          </NavLink>

          {isAuthenticated && (
            <NavLink
              to="/create"
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium transition-colors ${
                  isActive
                    ? 'bg-purple-100 text-purple-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <PlusCircle className="w-5 h-5" />
              <span>Create</span>
            </NavLink>
          )}

          {isAuthenticated && (
            <>
              <NavLink
                to="/friends"
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium transition-colors ${
                    isActive
                      ? 'bg-purple-100 text-purple-800'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <Users className="w-5 h-5" />
                <span>Friends</span>
              </NavLink>

              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium transition-colors ${
                    isActive
                      ? 'bg-purple-100 text-purple-800'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <User className="w-5 h-5" />
                <span>My Profile</span>
              </NavLink>

              <NavLink
                to="/submissions"
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium transition-colors ${
                    isActive
                      ? 'bg-purple-100 text-purple-800'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <Layers className="w-5 h-5" />
                <span>Submissions</span>
              </NavLink>

              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium transition-colors ${
                    isActive
                      ? 'bg-purple-100 text-purple-800'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </NavLink>
            </>
          )}

          {/* Role-governed menu items */}
          {role === UserRole.ADMIN && (
            <NavLink
              to="/moderation"
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium transition-colors ${
                  isActive
                    ? 'bg-purple-100 text-purple-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <ShieldCheck className="w-5 h-5 text-purple-600" />
              <span>Admin Queue</span>
            </NavLink>
          )}

          {(role === UserRole.PARENT || role === UserRole.ADMIN) && (
            <NavLink
              to="/parent"
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium transition-colors ${
                  isActive
                    ? 'bg-purple-100 text-purple-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <UserCheck className="w-5 h-5 text-purple-600" />
              <span>Parent Portal</span>
            </NavLink>
          )}

          {isAuthenticated && (
            <NavLink
              to="/notifications"
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-colors ${
                  isActive
                    ? 'bg-purple-100 text-purple-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <div className="flex items-center space-x-3">
                <Bell className="w-5 h-5" />
                <span>Alerts</span>
              </div>
              {unreadCount > 0 && (
                <span className="bg-purple-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </NavLink>
          )}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 pt-16 pb-20 md:pb-8 px-4 sm:px-6 max-w-4xl mx-auto w-full">
        {/* Child Account Paused Banner */}
        {role === UserRole.CHILD && safetyControls?.isPaused && (
          <div className="mb-6 p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-start gap-3 shadow-sm animate-in fade-in duration-300">
            <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-sm shrink-0">
              ⏸️
            </div>
            <div>
              <h3 className="font-bold text-sm text-amber-900">Account Paused by Parent</h3>
              <p className="text-xs text-amber-800 mt-0.5">
                {safetyControls.pauseReason || 'Your parent or guardian has paused your platform interactions for a break.'}
              </p>
            </div>
          </div>
        )}

        <Outlet />
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around py-3 z-50">
        <NavLink to="/" className={({ isActive }) => (isActive ? 'text-purple-600' : 'text-slate-500')}>
          <Home className="w-6 h-6" />
        </NavLink>
        <NavLink to="/reels" className={({ isActive }) => (isActive ? 'text-purple-600' : 'text-slate-500')}>
          <Film className="w-6 h-6" />
        </NavLink>
        {isAuthenticated && (
          <NavLink to="/create" className={({ isActive }) => (isActive ? 'text-purple-600' : 'text-slate-500')}>
            <PlusCircle className="w-6 h-6" />
          </NavLink>
        )}
        {role === UserRole.ADMIN && (
          <NavLink to="/moderation" className={({ isActive }) => (isActive ? 'text-purple-600' : 'text-slate-500')}>
            <ShieldCheck className="w-6 h-6" />
          </NavLink>
        )}
        {(role === UserRole.PARENT || role === UserRole.ADMIN) && (
          <NavLink to="/parent" className={({ isActive }) => (isActive ? 'text-purple-600' : 'text-slate-500')}>
            <UserCheck className="w-6 h-6" />
          </NavLink>
        )}
      </nav>
    </div>
  );
};
