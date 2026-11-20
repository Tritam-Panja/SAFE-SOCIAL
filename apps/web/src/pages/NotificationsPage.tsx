import React, { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { Bell, CheckCheck, Sparkles, Clock } from 'lucide-react';
import { useRealtime } from '../context/RealtimeContext';
import { RealtimeEvent } from '@fizzy/shared-types';

export const NotificationsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { on } = useRealtime();

  // 1. Fetch user's notifications
  const { data: notifData, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await apiClient.get('/notifications');
      return res.data;
    },
  });

  // Listen for live incoming notifications
  useEffect(() => {
    const unsubscribe = on(RealtimeEvent.NOTIFICATION_CREATED, (payload) => {
      console.log('[Notifications] Received live notification:', payload);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    return unsubscribe;
  }, [on, queryClient]);

  // 2. Mark single notification as read
  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.patch(`/notifications/${id}/read`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // 3. Mark all as read
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.patch('/notifications/read-all');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handleNotificationClick = (n: any) => {
    if (!n.isRead) {
      markReadMutation.mutate(n.id);
    }

    // Contextual navigation to related entity
    if (n.type === 'FRIEND_REQUEST' || n.type === 'FRIEND_ACCEPTED') {
      navigate('/friends');
    } else if (n.type === 'PARENT_ALERT' || n.type === 'PARENT_CONSENT_REQUEST') {
      navigate('/parent');
    } else if (n.type === 'CONTENT_APPROVED' || n.type === 'CONTENT_REJECTED') {
      navigate('/submissions');
    }
  };

  const notifications = notifData?.data || [];
  const unreadCount = notifData?.meta?.unreadCount || 0;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            Safety Alerts & Updates <Bell className="w-6 h-6 text-purple-600" />
          </h1>
          <p className="text-sm text-slate-500">
            Real-time status on your creations, friend connections, and guardian alerts.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" /> Mark all read
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs font-bold text-slate-400">Loading alerts...</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-2">
          <Sparkles className="w-10 h-10 text-purple-400 mx-auto" />
          <h2 className="font-bold text-slate-800 text-base">You're all caught up!</h2>
          <p className="text-xs text-slate-500">
            Updates on your submissions, reviews, and friend requests will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {notifications.map((n: any) => (
            <div
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                n.isRead
                  ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                  : 'bg-purple-50/50 border-purple-200 text-purple-950 shadow-xs hover:border-purple-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                    n.isRead ? 'bg-slate-300' : 'bg-purple-600 animate-pulse'
                  }`}
                />
                <div className="space-y-0.5">
                  <h3 className="font-bold text-xs">{n.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{n.message}</p>
                  <p className="text-[10px] text-slate-400 font-medium pt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(n.createdAt).toLocaleDateString()} at{' '}
                    {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              {!n.isRead && (
                <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full shrink-0">
                  New
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
