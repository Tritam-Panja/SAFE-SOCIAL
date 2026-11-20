import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { RealtimeEvent, RealtimeEventPayloads } from '@fizzy/shared-types';
import { apiClient } from '../services/api';
import { useQueryClient } from '@tanstack/react-query';

interface RealtimeContextType {
  socket: Socket | null;
  isConnected: boolean;
  isPollingFallback: boolean;
  lastSyncedAt: string | null;
  recoverMissedState: () => Promise<void>;
  on: <E extends RealtimeEvent>(event: E, handler: (payload: RealtimeEventPayloads[E]) => void) => () => void;
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user, updateSafetyControls } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isPollingFallback, setIsPollingFallback] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const lastSyncTimeRef = useRef<string>(new Date(Date.now() - 1000 * 60 * 30).toISOString());

  // Function to recover state via database-backed API
  const recoverMissedState = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await apiClient.get(`/realtime/sync?since=${encodeURIComponent(lastSyncTimeRef.current)}`);
      if (res.data?.success && res.data?.data) {
        const data = res.data.data;
        lastSyncTimeRef.current = data.syncedAt;
        setLastSyncedAt(data.syncedAt);

        // Synchronize parent controls if returned
        if (data.parentControls) {
          updateSafetyControls(data.parentControls);
        }

        // Refresh relevant caches
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['feed'] });
        queryClient.invalidateQueries({ queryKey: ['friends'] });
        queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
        queryClient.invalidateQueries({ queryKey: ['moderation-queue'] });
        queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
      }
    } catch (err) {
      console.warn('[Realtime] Failed to sync missed state:', err);
    }
  }, [isAuthenticated, queryClient, updateSafetyControls]);

  useEffect(() => {
    // Connect only when user is authenticated
    if (!isAuthenticated || !user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    let reconnectAttempts = 0;

    // Determine target host from window.location or configured baseURL
    const socket = io({
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Realtime] Socket connected successfully:', socket.id);
      setIsConnected(true);
      setIsPollingFallback(false);
      reconnectAttempts = 0;

      // On initial connect or reconnect, recover any missed state
      recoverMissedState();
    });

    socket.on('disconnect', (reason) => {
      console.log('[Realtime] Socket disconnected:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.warn('[Realtime] Connection error:', error.message);
      setIsConnected(false);
      reconnectAttempts++;
      // If disconnected for multiple attempts, enable background polling fallback
      if (reconnectAttempts >= 3) {
        setIsPollingFallback(true);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [isAuthenticated, user?.id, recoverMissedState]);

  // Configurable polling fallback when disconnected
  useEffect(() => {
    if (!isAuthenticated || isConnected || !isPollingFallback) return;

    console.log('[Realtime] Fallback polling active (interval: 15s)');
    const interval = setInterval(() => {
      recoverMissedState();
    }, 15000);

    return () => clearInterval(interval);
  }, [isAuthenticated, isConnected, isPollingFallback, recoverMissedState]);

  // Clean listener subscription helper with duplicate prevention
  const on = useCallback(
    <E extends RealtimeEvent>(event: E, handler: (payload: RealtimeEventPayloads[E]) => void) => {
      const socket = socketRef.current;
      if (!socket) return () => {};

      // Dedup wrapper using payload identifier where applicable
      const processedEventIds = new Set<string>();

      const safeHandler = (payload: any) => {
        const id = payload?.id || payload?.contentId || payload?.requestId || payload?.reportId;
        if (id) {
          const key = `${event}:${id}`;
          if (processedEventIds.has(key)) {
            return; // Ignore duplicate
          }
          processedEventIds.add(key);
          if (processedEventIds.size > 200) {
            // Prune oldest
            const first = processedEventIds.values().next().value;
            if (first) processedEventIds.delete(first);
          }
        }
        handler(payload);
      };

      socket.on(event, safeHandler as any);
      return () => {
        socket.off(event, safeHandler as any);
      };
    },
    []
  );

  return (
    <RealtimeContext.Provider
      value={{
        socket: socketRef.current,
        isConnected,
        isPollingFallback,
        lastSyncedAt,
        recoverMissedState,
        on,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
};

export const useRealtime = (): RealtimeContextType => {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
};
