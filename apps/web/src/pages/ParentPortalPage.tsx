import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import {
  UserCheck,
  Shield,
  Link,
  Trash2,
  CheckCircle,
  AlertCircle,
  Users,
  Activity,
  FileText,
  Sliders,
  PauseCircle,
  PlayCircle,
  UserPlus,
  Film,
  Clock,
} from 'lucide-react';

export const ParentPortalPage: React.FC = () => {
  const queryClient = useQueryClient();

  // Linking Form State
  const [childUsername, setChildUsername] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Active Settings Editor State
  const [selectedChild, setSelectedChild] = useState<any | null>(null);
  const [pendingSettings, setPendingSettings] = useState<any | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // 1. Fetch Linked Children with Safety Settings & Activity
  const { data: childrenData, isLoading: loadingChildren } = useQuery({
    queryKey: ['parent-children'],
    queryFn: async () => {
      const res = await apiClient.get('/parent/children');
      return res.data;
    },
  });

  // 2. Fetch Link Requests history
  const { data: requestsData } = useQuery({
    queryKey: ['parent-link-requests'],
    queryFn: async () => {
      const res = await apiClient.get('/parent/link-requests');
      return res.data;
    },
  });

  // 3. Link Child Mutation
  const linkMutation = useMutation({
    mutationFn: async ({ username, code }: { username: string; code: string }) => {
      const res = await apiClient.post('/parent/link-requests', {
        childUsername: username,
        verificationCode: code,
      });
      return res.data;
    },
    onSuccess: (res) => {
      setFeedback({
        type: 'success',
        message: `Child account @${res.data?.child?.username} linked successfully!`,
      });
      setChildUsername('');
      setVerificationCode('');
      queryClient.invalidateQueries({ queryKey: ['parent-children'] });
      queryClient.invalidateQueries({ queryKey: ['parent-link-requests'] });
      setTimeout(() => setFeedback(null), 5000);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || 'Failed to link child account.';
      setFeedback({ type: 'error', message: msg });
      setTimeout(() => setFeedback(null), 5000);
    },
  });

  // 4. Unlink Child Mutation
  const unlinkMutation = useMutation({
    mutationFn: async (linkOrChildId: string) => {
      const res = await apiClient.delete(`/parent/children/${linkOrChildId}`);
      return res.data;
    },
    onSuccess: () => {
      setFeedback({
        type: 'success',
        message: 'Child account successfully unlinked from your dashboard.',
      });
      if (selectedChild) setSelectedChild(null);
      queryClient.invalidateQueries({ queryKey: ['parent-children'] });
      queryClient.invalidateQueries({ queryKey: ['parent-link-requests'] });
      setTimeout(() => setFeedback(null), 4000);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || 'Could not unlink child.';
      setFeedback({ type: 'error', message: msg });
      setTimeout(() => setFeedback(null), 5000);
    },
  });

  // 5. Update Safety Settings Mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async ({ childId, settings }: { childId: string; settings: any }) => {
      const res = await apiClient.patch(`/parent/children/${childId}/settings`, settings);
      return res.data;
    },
    onSuccess: (res) => {
      setFeedback({
        type: 'success',
        message: `Safety settings updated for @${res.data?.childUsername}! Logged to audit history.`,
      });
      setShowConfirmModal(false);
      setSelectedChild(null);
      queryClient.invalidateQueries({ queryKey: ['parent-children'] });
      setTimeout(() => setFeedback(null), 5000);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message || 'Failed to save safety settings.';
      setFeedback({ type: 'error', message: msg });
      setShowConfirmModal(false);
      setTimeout(() => setFeedback(null), 5000);
    },
  });

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!childUsername.trim() || !verificationCode.trim()) return;
    linkMutation.mutate({ username: childUsername.trim(), code: verificationCode.trim() });
  };

  const openSettingsEditor = (childEntry: any) => {
    setSelectedChild(childEntry);
    setPendingSettings({
      isPaused: childEntry.safetySettings?.isPaused || false,
      pauseReason: childEntry.safetySettings?.pauseReason || 'Break time',
      dailyLimitMinutes: childEntry.safetySettings?.dailyLimitMinutes || 60,
      canComment: childEntry.safetySettings?.canComment ?? true,
      canCreateContent: childEntry.safetySettings?.canCreateContent ?? true,
      canAddFriends: childEntry.safetySettings?.canAddFriends ?? true,
      canReceiveFriendRequests: childEntry.safetySettings?.canReceiveFriendRequests ?? true,
      canWatchShortsReels: childEntry.safetySettings?.canWatchShortsReels ?? true,
      notifyOnFriendRequest: childEntry.safetySettings?.notifyOnFriendRequest ?? true,
      notifyOnContentStatus: childEntry.safetySettings?.notifyOnContentStatus ?? true,
    });
  };

  const children = childrenData?.data || [];
  const linkRequests = requestsData?.data || [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b border-slate-200 pb-3">
        <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          Parent Safety & Supervision Dashboard <UserCheck className="w-6 h-6 text-purple-600" />
        </h1>
        <p className="text-sm text-slate-500">
          Enforce granular screen time guardrails, account pause, and social permissions.
        </p>
      </div>

      {/* Verification Notice */}
      <div className="bg-purple-50 border border-purple-200 text-purple-900 rounded-2xl p-4 text-xs flex items-start gap-3">
        <Shield className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Zero-Trust Child Verification:</span> Knowing a child's username alone is never sufficient proof of authority. Enter the child's pairing code displayed in their account settings (or prototype demo code: <code className="bg-purple-200 px-1.5 py-0.5 rounded font-mono font-bold">DEMO-LINK-123</code>).
        </div>
      </div>

      {/* Global Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Settings Editor Modal / Section */}
      {selectedChild && pendingSettings && (
        <div className="bg-white rounded-2xl border-2 border-purple-500 p-6 shadow-md space-y-5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-purple-600" /> Safety Controls for @{selectedChild.child.username}
              </h2>
              <p className="text-xs text-slate-500">Changes take effect immediately at the database level.</p>
            </div>
            <button
              onClick={() => setSelectedChild(null)}
              className="text-xs text-slate-400 hover:text-slate-600 font-bold px-2 py-1"
            >
              Close
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-5 text-xs">
            {/* Account Pause / Resume */}
            <div className={`p-4 rounded-xl border ${pendingSettings.isPaused ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  {pendingSettings.isPaused ? <PauseCircle className="w-4 h-4 text-amber-600" /> : <PlayCircle className="w-4 h-4 text-emerald-600" />}
                  Account Access Status
                </span>
                <button
                  type="button"
                  onClick={() => setPendingSettings({ ...pendingSettings, isPaused: !pendingSettings.isPaused })}
                  className={`px-3 py-1 rounded-full font-bold text-xs transition-colors ${
                    pendingSettings.isPaused
                      ? 'bg-amber-600 text-white'
                      : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                  }`}
                >
                  {pendingSettings.isPaused ? 'Account PAUSED' : 'Account ACTIVE'}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Pausing halts all platform interactions (posting, liking, feed browsing, chatting).
              </p>
              {pendingSettings.isPaused && (
                <input
                  type="text"
                  value={pendingSettings.pauseReason}
                  onChange={(e) => setPendingSettings({ ...pendingSettings, pauseReason: e.target.value })}
                  placeholder="Reason for pause (e.g. Bedtime, homework time)..."
                  className="mt-2 w-full px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-lg"
                />
              )}
            </div>

            {/* Daily Screen Time */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-purple-600" /> Daily Screen Allowance
                </span>
                <span className="font-extrabold text-purple-600 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200">
                  {pendingSettings.dailyLimitMinutes} mins/day
                </span>
              </div>
              <input
                type="range"
                min={15}
                max={180}
                step={15}
                value={pendingSettings.dailyLimitMinutes}
                onChange={(e) => setPendingSettings({ ...pendingSettings, dailyLimitMinutes: Number(e.target.value) })}
                className="w-full accent-purple-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>15m</span>
                <span>60m</span>
                <span>120m</span>
                <span>180m</span>
              </div>
            </div>

            {/* Social Permissions */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <span className="font-bold text-slate-800 block mb-1 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-purple-600" /> Social & Friend Permissions
              </span>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-slate-700">Can Send Friend Requests:</span>
                <input
                  type="checkbox"
                  checked={pendingSettings.canAddFriends}
                  onChange={(e) => setPendingSettings({ ...pendingSettings, canAddFriends: e.target.checked })}
                  className="w-4 h-4 accent-purple-600 rounded"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-slate-700">Can Receive Inbound Friend Requests:</span>
                <input
                  type="checkbox"
                  checked={pendingSettings.canReceiveFriendRequests}
                  onChange={(e) => setPendingSettings({ ...pendingSettings, canReceiveFriendRequests: e.target.checked })}
                  className="w-4 h-4 accent-purple-600 rounded"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-slate-700">Require Parent Approval for New Friends:</span>
                <input
                  type="checkbox"
                  checked={pendingSettings.requireParentApprovalForFriends ?? true}
                  onChange={(e) => setPendingSettings({ ...pendingSettings, requireParentApprovalForFriends: e.target.checked })}
                  className="w-4 h-4 accent-purple-600 rounded"
                />
              </label>
            </div>

            {/* Content & Notification Controls */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <span className="font-bold text-slate-800 block mb-1 flex items-center gap-1.5">
                <Film className="w-4 h-4 text-purple-600" /> Content & Notifications
              </span>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-slate-700">Allow Freeform Comments:</span>
                <input
                  type="checkbox"
                  checked={pendingSettings.canComment}
                  onChange={(e) => setPendingSettings({ ...pendingSettings, canComment: e.target.checked })}
                  className="w-4 h-4 accent-purple-600 rounded"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-slate-700">Allow Posting Photos & Art:</span>
                <input
                  type="checkbox"
                  checked={pendingSettings.canCreateContent}
                  onChange={(e) => setPendingSettings({ ...pendingSettings, canCreateContent: e.target.checked })}
                  className="w-4 h-4 accent-purple-600 rounded"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-slate-700">Allow Watching Shorts & Reels:</span>
                <input
                  type="checkbox"
                  checked={pendingSettings.canWatchShortsReels}
                  onChange={(e) => setPendingSettings({ ...pendingSettings, canWatchShortsReels: e.target.checked })}
                  className="w-4 h-4 accent-purple-600 rounded"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-slate-700">Notify Parent on Friend Requests:</span>
                <input
                  type="checkbox"
                  checked={pendingSettings.notifyOnFriendRequest}
                  onChange={(e) => setPendingSettings({ ...pendingSettings, notifyOnFriendRequest: e.target.checked })}
                  className="w-4 h-4 accent-purple-600 rounded"
                />
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setSelectedChild(null)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-colors"
            >
              Review & Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && selectedChild && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-600" /> Confirm Safety Guardrail Changes
            </h3>
            <p className="text-xs text-slate-600">
              You are updating safety rules for <strong>@{selectedChild.child.username}</strong>. All changes are enforced immediately on child API requests and recorded in the audit history.
            </p>
            <div className="p-3 bg-slate-50 rounded-xl text-[11px] space-y-1 font-mono text-slate-700">
              <div>Account Status: {pendingSettings.isPaused ? 'PAUSED' : 'ACTIVE'}</div>
              <div>Comments: {pendingSettings.canComment ? 'Allowed' : 'Disabled'}</div>
              <div>Friends Sending: {pendingSettings.canAddFriends ? 'Allowed' : 'Disabled'}</div>
              <div>Friends Receiving: {pendingSettings.canReceiveFriendRequests ? 'Allowed' : 'Disabled'}</div>
              <div>Shorts & Reels: {pendingSettings.canWatchShortsReels ? 'Allowed' : 'Disabled'}</div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600"
              >
                Go Back
              </button>
              <button
                onClick={() =>
                  updateSettingsMutation.mutate({
                    childId: selectedChild.child.username,
                    settings: pendingSettings,
                  })
                }
                disabled={updateSettingsMutation.isPending}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold"
              >
                Confirm & Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link a New Child Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Link className="w-4 h-4 text-purple-600" /> Link a Child Account
        </h2>

        <form onSubmit={handleLinkSubmit} className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">
              Child's Username
            </label>
            <input
              type="text"
              value={childUsername}
              onChange={(e) => setChildUsername(e.target.value)}
              placeholder="e.g. leo_lion_7"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">
              Verification / Link Code
            </label>
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              placeholder="Code from child settings or DEMO-LINK-123"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white font-mono"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={linkMutation.isPending || !childUsername || !verificationCode}
              className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
            >
              <Link className="w-4 h-4" /> Verify & Link
            </button>
          </div>
        </form>
      </div>

      {/* Linked Children Overview */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-600" /> Linked Children ({children.length})
        </h2>

        {loadingChildren ? (
          <p className="text-xs text-slate-400 py-4">Loading your linked children...</p>
        ) : children.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-xs italic">
            No children are currently linked to this parent account. Use the form above to link a child.
          </div>
        ) : (
          <div className="grid gap-6">
            {children.map((item: any) => (
              <div
                key={item.linkId}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
              >
                {/* Child Header Card */}
                <div className="p-5 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-purple-600 text-white font-black flex items-center justify-center text-base shadow">
                      {item.child?.username?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-base">
                        {item.child?.displayName} (@{item.child?.username})
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-bold bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full uppercase">
                          {item.child?.ageGroup} Tier
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Account: <strong className={item.safetySettings?.isPaused ? 'text-amber-600' : 'text-emerald-600'}>
                            {item.safetySettings?.isPaused ? 'PAUSED' : 'ACTIVE'}
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openSettingsEditor(item)}
                      className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <Sliders className="w-3.5 h-3.5" /> Safety Controls
                    </button>
                    <button
                      onClick={() => unlinkMutation.mutate(item.linkId)}
                      disabled={unlinkMutation.isPending}
                      className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 hover:border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Unlink
                    </button>
                  </div>
                </div>

                {/* Safety Controls & Activity Grid */}
                <div className="p-5 grid md:grid-cols-2 gap-6 text-xs">
                  {/* Safety Settings Summary */}
                  <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <h4 className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Shield className="w-4 h-4 text-purple-600" /> Active Safety Rules
                    </h4>
                    <ul className="space-y-2 text-slate-600">
                      <li className="flex justify-between items-center py-1 border-b border-slate-200">
                        <span>Daily Screen Time:</span>
                        <strong className="text-purple-700">{item.safetySettings?.dailyLimitMinutes || 60} mins</strong>
                      </li>
                      <li className="flex justify-between items-center py-1 border-b border-slate-200">
                        <span>Watch Shorts & Reels:</span>
                        <strong className={item.safetySettings?.canWatchShortsReels ? 'text-emerald-600' : 'text-slate-400'}>
                          {item.safetySettings?.canWatchShortsReels ? 'Allowed' : 'Restricted'}
                        </strong>
                      </li>
                      <li className="flex justify-between items-center py-1 border-b border-slate-200">
                        <span>Send Friend Requests:</span>
                        <strong className={item.safetySettings?.canAddFriends ? 'text-emerald-600' : 'text-slate-400'}>
                          {item.safetySettings?.canAddFriends ? 'Allowed' : 'Off'}
                        </strong>
                      </li>
                      <li className="flex justify-between items-center py-1 border-b border-slate-200">
                        <span>Receive Friend Requests:</span>
                        <strong className={item.safetySettings?.canReceiveFriendRequests ? 'text-emerald-600' : 'text-slate-400'}>
                          {item.safetySettings?.canReceiveFriendRequests ? 'Allowed' : 'Off'}
                        </strong>
                      </li>
                      <li className="flex justify-between items-center py-1">
                        <span>Freeform Comments:</span>
                        <strong className={item.safetySettings?.canComment ? 'text-emerald-600' : 'text-slate-400'}>
                          {item.safetySettings?.canComment ? 'Allowed' : 'Disabled'}
                        </strong>
                      </li>
                    </ul>
                  </div>

                  {/* Recent Kid Activity Summary */}
                  <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <h4 className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-purple-600" /> Activity Oversight
                    </h4>

                    {/* Posts Summary */}
                    <div>
                      <p className="font-semibold text-slate-600 text-[11px] mb-1">Recent Submissions:</p>
                      {item.recentActivity?.recentPosts?.length > 0 ? (
                        <div className="space-y-1">
                          {item.recentActivity.recentPosts.slice(0, 3).map((p: any) => (
                            <div key={p.id} className="flex justify-between items-center text-[11px] bg-white p-1.5 rounded border border-slate-100">
                              <span className="truncate max-w-[150px] font-medium">{p.title || 'Untitled Post'}</span>
                              <span className="font-mono text-[9px] bg-purple-50 text-purple-700 px-1 rounded font-bold">
                                {p.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">No posts submitted yet.</p>
                      )}
                    </div>

                    {/* Friends Summary */}
                    <div>
                      <p className="font-semibold text-slate-600 text-[11px] mb-1">
                        Friends Network ({item.recentActivity?.friendsCount || 0}):
                      </p>
                      {item.recentActivity?.recentFriends?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {item.recentActivity.recentFriends.map((f: any) => (
                            <span key={f.friendshipId} className="bg-white border border-slate-200 px-2 py-0.5 rounded text-[10px] font-bold text-slate-700">
                              @{f.friend}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">No friends connected yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Link Requests Audit History */}
      {linkRequests.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-slate-400" /> Link History & Audit Log ({linkRequests.length})
          </h3>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {linkRequests.map((req: any) => (
              <div
                key={req.id}
                className="text-xs bg-slate-50 p-2 rounded-xl border border-slate-100 flex justify-between items-center"
              >
                <div>
                  <span className="font-bold text-slate-800">@{req.child?.username}</span>
                  <span className="text-[10px] text-slate-400 ml-2">
                    {new Date(req.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    req.status === 'CONFIRMED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : req.status === 'REVOKED'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {req.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
