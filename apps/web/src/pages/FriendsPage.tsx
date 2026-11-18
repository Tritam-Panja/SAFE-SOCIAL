import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Users, UserPlus, Check, X, Shield, Clock } from 'lucide-react';

export const FriendsPage: React.FC = () => {
  const [targetUsername, setTargetUsername] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const queryClient = useQueryClient();

  // 1. Fetch Friends List
  const { data: friendsData, isLoading: loadingFriends } = useQuery({
    queryKey: ['friends'],
    queryFn: async () => {
      const res = await apiClient.get('/friends');
      return res.data;
    },
  });

  // 2. Fetch Friend Requests
  const { data: requestsData } = useQuery({
    queryKey: ['friend-requests'],
    queryFn: async () => {
      const res = await apiClient.get('/friends/requests');
      return res.data;
    },
  });

  // 3. Send Friend Request Mutation
  const sendRequestMutation = useMutation({
    mutationFn: async (username: string) => {
      const res = await apiClient.post('/friends/request', { targetUsername: username });
      return res.data;
    },
    onSuccess: () => {
      setFeedback({ type: 'success', message: `Friend request sent to @${targetUsername}!` });
      setTargetUsername('');
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      setTimeout(() => setFeedback(null), 4000);
    },
    onError: (err: any) => {
      const message = err.response?.data?.error?.message || 'Could not send friend request.';
      setFeedback({ type: 'error', message });
      setTimeout(() => setFeedback(null), 5000);
    },
  });

  // 4. Respond to Friend Request (Accept / Reject)
  const respondMutation = useMutation({
    mutationFn: async ({ requestId, action }: { requestId: string; action: 'ACCEPT' | 'REJECT' }) => {
      const res = await apiClient.post(`/friends/respond/${requestId}`, { action });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
    },
  });

  // 5. Remove Friendship
  const removeFriendMutation = useMutation({
    mutationFn: async (friendshipId: string) => {
      await apiClient.delete(`/friends/${friendshipId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUsername.trim()) return;
    sendRequestMutation.mutate(targetUsername.trim());
  };

  const friends = friendsData?.data || [];
  const incoming = requestsData?.data?.incoming || [];
  const outgoing = requestsData?.data?.outgoing || [];

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="border-b border-slate-200 pb-3">
        <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          Safe Friend Network <Users className="w-6 h-6 text-purple-600" />
        </h1>
        <p className="text-sm text-slate-500">
          Connect with trusted friends in your age tier under parental supervision.
        </p>
      </div>

      {/* Parental control notice */}
      <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900 flex items-start gap-2.5">
        <Shield className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Parent-Supervised Socializing:</span> Parents can review friend connections, approve requests, or turn off friend requests anytime from the Parent Portal.
        </div>
      </div>

      {/* Send Friend Request Form */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <UserPlus className="w-4 h-4 text-purple-600" /> Add a Friend
        </h2>

        {feedback && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {feedback.message}
          </div>
        )}

        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={targetUsername}
            onChange={(e) => setTargetUsername(e.target.value)}
            placeholder="Enter friend's username (e.g. maya_explorer)..."
            className="flex-1 px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white"
          />
          <button
            type="submit"
            disabled={sendRequestMutation.isPending || !targetUsername.trim()}
            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
          >
            Send Request
          </button>
        </form>
      </div>

      {/* Pending Incoming Requests */}
      {incoming.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-purple-200 shadow-sm space-y-3">
          <h2 className="text-sm font-bold text-purple-900 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-purple-600" /> Incoming Requests ({incoming.length})
          </h2>
          <div className="space-y-2">
            {incoming.map((req: any) => (
              <div
                key={req.id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100"
              >
                <div>
                  <p className="font-bold text-xs text-slate-800">@{req.sender?.username}</p>
                  <p className="text-[11px] text-slate-400">{req.sender?.displayName || req.sender?.ageGroup + ' Tier'}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => respondMutation.mutate({ requestId: req.id, action: 'ACCEPT' })}
                    disabled={respondMutation.isPending}
                    className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                    title="Accept"
                  >
                    <Check className="w-3.5 h-3.5" /> Accept
                  </button>
                  <button
                    onClick={() => respondMutation.mutate({ requestId: req.id, action: 'REJECT' })}
                    disabled={respondMutation.isPending}
                    className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                    title="Decline"
                  >
                    <X className="w-3.5 h-3.5" /> Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends List */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <Users className="w-4 h-4 text-purple-600" /> Your Friends ({friends.length})
        </h2>

        {loadingFriends ? (
          <p className="text-xs text-slate-400">Loading friend network...</p>
        ) : friends.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-4 text-center">
            You don't have any friends added yet. Send a request to get connected!
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {friends.map((item: any) => (
              <div
                key={item.friendshipId}
                className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center font-bold text-xs">
                    {item.friend?.username?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-xs text-slate-800">@{item.friend?.username}</p>
                    <p className="text-[10px] text-purple-600 font-semibold">{item.friend?.ageGroup} Tier</p>
                  </div>
                </div>

                <button
                  onClick={() => removeFriendMutation.mutate(item.friendshipId)}
                  className="text-[11px] text-slate-400 hover:text-red-600 font-medium transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Outgoing Requests */}
      {outgoing.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <h3 className="text-xs font-bold text-slate-600">Pending Sent Requests ({outgoing.length})</h3>
          <div className="space-y-1.5">
            {outgoing.map((req: any) => (
              <div key={req.id} className="text-xs text-slate-600 flex justify-between items-center py-1 border-b border-slate-50 last:border-none">
                <span>Waiting for <strong>@{req.receiver?.username}</strong> to accept</span>
                <span className="text-[10px] text-slate-400">Pending</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
