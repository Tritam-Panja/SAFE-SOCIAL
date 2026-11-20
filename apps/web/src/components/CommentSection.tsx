import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { MessageCircle, Send, Flag, Trash2, Clock, CheckCircle } from 'lucide-react';
import { useRealtime } from '../context/RealtimeContext';
import { useAuth } from '../context/AuthContext';
import { RealtimeEvent } from '@fizzy/shared-types';

interface CommentProps {
  contentId: string;
  initialCount?: number;
}

export const CommentSection: React.FC<CommentProps> = ({ contentId, initialCount = 0 }) => {
  const { safetyControls } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const [submissionFeedback, setSubmissionFeedback] = useState<string | null>(null);
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { on } = useRealtime();

  useEffect(() => {
    const unsubscribe = on<any>(RealtimeEvent.COMMENT_APPROVED, (payload) => {
      if (payload && payload.contentId === contentId) {
        queryClient.invalidateQueries({ queryKey: ['comments', contentId] });
      }
    });
    return () => {
      unsubscribe();
    };
  }, [contentId, on, queryClient]);

  // Fetch approved comments
  const { data: commentsData, isLoading } = useQuery({
    queryKey: ['comments', contentId],
    queryFn: async () => {
      const res = await apiClient.get(`/comments/${contentId}`);
      return res.data;
    },
    enabled: isOpen,
  });

  // Submit comment (requires admin moderation)
  const submitMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await apiClient.post(`/comments/${contentId}`, { text: body });
      return res.data;
    },
    onSuccess: () => {
      setText('');
      setSubmissionFeedback(
        'Comment submitted for review! It will become visible once approved by a moderator.'
      );
      setTimeout(() => setSubmissionFeedback(null), 5000);
    },
  });

  // Delete own comment
  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      await apiClient.delete(`/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', contentId] });
    },
  });

  // Report comment
  const reportMutation = useMutation({
    mutationFn: async ({ commentId, reason }: { commentId: string; reason: string }) => {
      const res = await apiClient.post(`/comments/${commentId}/report`, { reason });
      return res.data;
    },
    onSuccess: () => {
      setReportFeedback('Comment reported to safety moderators. Thank you for keeping Fizzy safe!');
      setTimeout(() => setReportFeedback(null), 4000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    submitMutation.mutate(text.trim());
  };

  const comments = commentsData?.data || [];

  return (
    <div className="border-t border-slate-100 pt-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-purple-600 transition-colors"
      >
        <MessageCircle className="w-4 h-4" />
        <span>
          {isOpen ? 'Hide comments' : `View comments (${comments.length > 0 ? comments.length : initialCount})`}
        </span>
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3">
          {/* Feedback messages */}
          {submissionFeedback && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
              <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{submissionFeedback}</span>
            </div>
          )}

          {reportFeedback && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{reportFeedback}</span>
            </div>
          )}

          {/* Comment input form */}
          {safetyControls?.canComment === false ? (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Commenting has been disabled for your account by your parent or guardian.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Add a kind comment... (reviewed before posting)"
                className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white"
                maxLength={280}
              />
              <button
                type="submit"
                disabled={submitMutation.isPending || !text.trim()}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          )}

          {/* Comment list */}
          {isLoading ? (
            <p className="text-[11px] text-slate-400 py-2">Loading approved comments...</p>
          ) : comments.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic py-1">No comments yet. Be the first to say something kind!</p>
          ) : (
            <div className="space-y-2 pt-1 max-h-56 overflow-y-auto pr-1">
              {comments.map((c: any) => (
                <div key={c.id} className="text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-bold text-slate-800">@{c.author?.username}</span>
                      <span className="text-[10px] text-purple-600 font-semibold">{c.author?.ageGroup}</span>
                    </div>
                    <p className="text-slate-700">{c.text}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => reportMutation.mutate({ commentId: c.id, reason: 'Inappropriate language' })}
                      title="Report comment"
                      className="text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      <Flag className="w-3.5 h-3.5" />
                    </button>
                    {c.isAuthor && (
                      <button
                        onClick={() => deleteMutation.mutate(c.id)}
                        title="Delete comment"
                        className="text-slate-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
