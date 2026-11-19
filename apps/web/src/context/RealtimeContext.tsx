import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { RealtimeEvent, RealtimeEventPayloads } from '@fizzy/shared-types';

interface RealtimeContextType {
  socket: Socket | null;
  isConnected: boolean;
  on: <E extends RealtimeEvent>(event: E, handler: (payload: RealtimeEventPayloads[E]) => void) => () => void;
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

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

    // Determine target host from window.location or configured baseURL
    const socket = io({
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Realtime] Socket connected successfully:', socket.id);
      setIsConnected(true);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Realtime] Socket disconnected:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.warn('[Realtime] Connection error:', error.message);
      setIsConnected(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [isAuthenticated, user?.id]);

  // Clean listener subscription helper
  const on = useCallback(
    <E extends RealtimeEvent>(event: E, handler: (payload: RealtimeEventPayloads[E]) => void) => {
      const socket = socketRef.current;
      if (!socket) return () => {};

      socket.on(event, handler as any);
      return () => {
        socket.off(event, handler as any);
      };
    },
    []
  );

  return (
    <RealtimeContext.Provider value={{ socket: socketRef.current, isConnected, on }}>
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
