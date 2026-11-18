import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../services/api';
import { Shield, Sparkles, Clock, CheckCircle, AlertTriangle, Edit3 } from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bioText, setBioText] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSubmittingBio, setIsSubmittingBio] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // 1. Fetch own profile data
  const { data: profileData } = useQuery({
    queryKey: ['profile', user?.username],
    queryFn: async () => {
      const res = await apiClient.get(`/users/profile/${user?.username}`);
      return res.data;
    },
    enabled: !!user?.username,
  });

  // 2. Fetch my submitted content & statuses
  const { data: submissionsData } = useQuery({
    queryKey: ['my-submissions'],
    queryFn: async () => {
      const res = await apiClient.get('/posts/my-submissions');
      return res.data;
    },
  });

  // 3. Update display name mutation
  const updateNameMutation = useMutation({
    mutationFn: async (newName: string) => {
      const res = await apiClient.put('/users/display-name', { displayName: newName });
      return res.data;
    },
    onSuccess: () => {
      setIsEditingName(false);
      setFeedback('Display name updated successfully!');
      queryClient.invalidateQueries({ queryKey: ['profile', user?.username] });
      setTimeout(() => setFeedback(null), 4000);
    },
  });

  // 4. Submit bio for moderation
  const submitBioMutation = useMutation({
    mutationFn: async (bio: string) => {
      const res = await apiClient.put('/users/bio', { bio });
      return res.data;
    },
    onSuccess: () => {
      setIsSubmittingBio(false);
      setBioText('');
      setFeedback('Bio submitted for safety review! It will update once approved.');
      queryClient.invalidateQueries({ queryKey: ['profile', user?.username] });
      setTimeout(() => setFeedback(null), 5000);
    },
  });

  const profile = profileData?.data;
  const submissions = submissionsData?.data || [];

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header Profile Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 text-white flex items-center justify-center font-black text-2xl shadow-md">
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div className="absolute -bottom-1 -right-1 bg-white p-1 rounded-full shadow">
              <span className="w-3.5 h-3.5 bg-emerald-500 rounded-full block" />
            </div>
          </div>

          <div className="flex-1 text-center sm:text-left space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
              <div>
                <h1 className="text-xl font-black text-slate-800">
                  {profile?.displayName || user?.displayName || user?.username}
                </h1>
                <p className="text-xs font-semibold text-slate-400">@{user?.username}</p>
              </div>

              <div className="flex items-center justify-center gap-1.5">
                <span className="text-[11px] font-bold bg-purple-100 text-purple-800 px-3 py-1 rounded-full uppercase tracking-wider">
                  {user?.ageGroup} Tier
                </span>
              </div>
            </div>

            {/* Bio section with moderation notice */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-700">
              <p className="italic">
                {profile?.bio ? `"${profile.bio}"` : 'No bio added yet.'}
              </p>
              {profile?.pendingBio && (
                <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200 flex items-center gap-1.5 font-medium">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>New bio pending safety approval: "{profile.pendingBio}"</span>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                onClick={() => setIsEditingName(!isEditingName)}
                className="px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-1 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" /> Edit Display Name
              </button>
              <button
                onClick={() => setIsSubmittingBio(!isSubmittingBio)}
                className="px-3 py-1.5 text-xs font-bold bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg flex items-center gap-1 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" /> Change Bio
              </button>
            </div>
          </div>
        </div>

        {/* Feedback message */}
        {feedback && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" /> {feedback}
          </div>
        )}

        {/* Edit Display Name Form */}
        {isEditingName && (
          <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <label className="text-xs font-bold text-slate-700">New Display Name (Nickname)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={40}
                className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
              <button
                onClick={() => updateNameMutation.mutate(displayName)}
                disabled={updateNameMutation.isPending || !displayName.trim()}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold"
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Submit Bio Form */}
        {isSubmittingBio && (
          <div className="mt-4 p-4 bg-purple-50 rounded-xl border border-purple-200 space-y-2">
            <label className="text-xs font-bold text-purple-900">
              Submit New Bio (Will be vetted by moderators before appearing)
            </label>
            <textarea
              value={bioText}
              onChange={(e) => setBioText(e.target.value)}
              maxLength={160}
              rows={2}
              placeholder="Tell others what hobbies or art you enjoy..."
              className="w-full px-3 py-2 text-xs bg-white border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsSubmittingBio(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => submitBioMutation.mutate(bioText)}
                disabled={submitBioMutation.isPending || !bioText.trim()}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold"
              >
                Submit for Moderation
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Safety & Non-PII Guarantee Box */}
      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-start gap-3">
        <Shield className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold">Privacy-By-Design Protection Active</p>
          <p className="text-[11px] text-emerald-700 mt-0.5">
            Your real birthdate, linked parent emails, and private location details are strictly masked and never visible to other children or external visitors.
          </p>
        </div>
      </div>

      {/* My Creations & Moderation Track Record */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-600" /> My Creations & Safety Status ({submissions.length})
        </h2>

        {submissions.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-4 text-center">
            You haven't submitted any posts or reels yet. Tap 'Create' to make something safe and fun!
          </p>
        ) : (
          <div className="space-y-3">
            {submissions.map((post: any) => (
              <div
                key={post.id}
                className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-bold text-slate-800">{post.title || 'Untitled Post'}</span>
                  <span className="text-[10px] ml-2 font-mono bg-slate-200 px-1.5 py-0.5 rounded text-slate-600">
                    {post.type}
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5">{post.caption || 'No caption'}</p>
                </div>

                <div>
                  {post.status === 'APPROVED' || post.status === 'PUBLISHED' ? (
                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold rounded-full text-[10px] flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Approved
                    </span>
                  ) : post.status === 'REJECTED' ? (
                    <span className="px-2.5 py-1 bg-rose-100 text-rose-800 font-bold rounded-full text-[10px] flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Changes Needed
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 bg-amber-100 text-amber-800 font-bold rounded-full text-[10px] flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Under Review
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
