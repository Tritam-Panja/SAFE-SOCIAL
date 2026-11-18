import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import { FeedPage } from '../pages/FeedPage';
import { ReelsPage } from '../pages/ReelsPage';
import { CreatePage } from '../pages/CreatePage';
import { ModerationPage } from '../pages/ModerationPage';
import { ParentPortalPage } from '../pages/ParentPortalPage';
import { FriendsPage } from '../pages/FriendsPage';
import { ProfilePage } from '../pages/ProfilePage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { ExplorePage } from '../pages/ExplorePage';
import { SubmissionsPage } from '../pages/SubmissionsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '@fizzy/shared-types';

export const AppRoutes: React.FC = () => {
  const { role, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-bold text-slate-500">Loading Fizzy...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        {/* Public or shared feeds */}
        <Route index element={<FeedPage />} />
        <Route path="explore" element={<ExplorePage />} />
        <Route path="reels" element={<ReelsPage />} />

        {/* Auth routes */}
        <Route path="login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" replace />} />
        <Route path="register" element={!isAuthenticated ? <RegisterPage /> : <Navigate to="/" replace />} />

        {/* Authenticated Social Routes */}
        <Route
          path="friends"
          element={isAuthenticated ? <FriendsPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="profile"
          element={isAuthenticated ? <ProfilePage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="profile/:username"
          element={isAuthenticated ? <ProfilePage /> : <Navigate to="/login" replace />}
        />

        <Route
          path="submissions"
          element={isAuthenticated ? <SubmissionsPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="settings"
          element={isAuthenticated ? <SettingsPage /> : <Navigate to="/login" replace />}
        />

        {/* Authenticated Creation */}
        <Route
          path="create"
          element={isAuthenticated ? <CreatePage /> : <Navigate to="/login" replace />}
        />

        {/* Role Protected: Admin Only */}
        <Route
          path="moderation"
          element={
            isAuthenticated && role === UserRole.ADMIN ? (
              <ModerationPage />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* Role Protected: Parent or Admin */}
        <Route
          path="parent"
          element={
            isAuthenticated && (role === UserRole.PARENT || role === UserRole.ADMIN) ? (
              <ParentPortalPage />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="notifications"
          element={isAuthenticated ? <NotificationsPage /> : <Navigate to="/login" replace />}
        />

        <Route
          path="*"
          element={
            <div className="text-center py-12">
              <h1 className="text-xl font-bold text-slate-800">Page Not Found</h1>
              <p className="text-sm text-slate-500 mt-1">The requested page does not exist.</p>
            </div>
          }
        />
      </Route>
    </Routes>
  );
};
