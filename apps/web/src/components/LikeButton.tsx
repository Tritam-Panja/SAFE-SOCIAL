import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Heart } from 'lucide-react';
import { useRealtime } from '../context/RealtimeContext';
import { RealtimeEvent } from '@fizzy/shared-types';

interface LikeButtonProps {
  contentId: string;
  initialLiked?: boolean;
  initialCount?: number;
}

export const LikeButton: React.FC<LikeButtonProps> = ({
  contentId,
  initialLiked = false,
  initialCount = 0,
}) => {
  const [hasLiked, setHasLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const { on } = useRealtime();

  useEffect(() => {
    const unsubscribe = on<any>(RealtimeEvent.REACTION_UPDATED, (payload) => {
      if (payload && payload.contentId === contentId) {
        setCount(payload.totalReactions);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [contentId, on]);

  const toggleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post(`/reactions/${contentId}/toggle`, { type: 'LIKE' });
      return res.data;
    },
    onMutate: () => {
      // Optimistic UI update
      setHasLiked((prev) => !prev);
      setCount((prev) => (hasLiked ? Math.max(0, prev - 1) : prev + 1));
    },
    onSuccess: (data) => {
      if (data?.data) {
        setHasLiked(data.data.reacted);
        setCount(data.data.reactionCount);
      }
    },
    onError: () => {
      // Rollback on error
      setHasLiked(initialLiked);
      setCount(initialCount);
    },
  });

  return (
    <button
      onClick={() => toggleMutation.mutate()}
      disabled={toggleMutation.isPending}
      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${
        hasLiked
          ? 'bg-rose-50 text-rose-600 border border-rose-200 shadow-xs'
          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
      }`}
    >
      <Heart
        className={`w-4 h-4 transition-transform ${
          hasLiked ? 'fill-rose-500 text-rose-500 scale-110' : 'text-slate-400'
        }`}
      />
      <span>{count}</span>
    </button>
  );
};
