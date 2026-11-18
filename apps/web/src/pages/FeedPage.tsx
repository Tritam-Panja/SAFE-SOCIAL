import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Sparkles, Shield, Eye, AlertCircle, Flag } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { LikeButton } from '../components/LikeButton';
import { CommentSection } from '../components/CommentSection';
import { ReportModal } from '../components/ReportModal';

export const FeedPage: React.FC = () => {
  const { user, ageGroup, isAuthenticated } = useAuth();
  const [reportingContentId, setReportingContentId] = useState<string | null>(null);

  const { data: feedData, isLoading, error } = useQuery({
    queryKey: ['feed', ageGroup],
    queryFn: async () => {
      const res = await apiClient.get('/feed');
      return res.data;
    },
    enabled: isAuthenticated,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            Safe Community Feed <Sparkles className="w-5 h-5 text-amber-500" />
          </h1>
          <p className="text-sm text-slate-500">
            {isAuthenticated ? (
              <>
                Showing approved posts vetted for <strong className="text-purple-600">{ageGroup}</strong> tier.
              </>
            ) : (
              'Sign in to explore age-vetted creations from your peers.'
            )}
          </p>
        </div>

        {user && (
          <div className="flex items-center gap-2 text-xs bg-purple-50 text-purple-700 px-3 py-1 rounded-full border border-purple-200 font-bold uppercase tracking-wider">
            {ageGroup} Tier Active
          </div>
        )}
      </div>

      {/* Zero-Trust Notice */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-2xl p-5 shadow-sm flex items-start gap-4">
        <Shield className="w-8 h-8 text-purple-200 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-bold text-base sm:text-lg">Database-Level Age Isolation Active</h2>
          <p className="text-xs sm:text-sm text-purple-100 mt-1">
            All queries are filtered directly in PostgreSQL. Younger children can never receive older-tier content, and pending/rejected media remains completely private.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs font-bold text-slate-400">Loading age-filtered feed...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Could not load feed. Please make sure you are signed in.</span>
        </div>
      )}

      {/* Live Feed List */}
      <div className="grid gap-6 max-w-lg mx-auto">
        {feedData?.data && feedData.data.length > 0 ? (
          feedData.data.map((item: any) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 text-white flex items-center justify-center font-bold text-xs">
                    {item.author?.username?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p className="font-bold text-sm text-slate-800">@{item.author?.username}</p>
                    <p className="text-[11px] text-slate-400">
                      {item.author?.ageGroup ? `${item.author.ageGroup} Tier` : 'Creator'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Eye className="w-3 h-3" /> Approved
                  </span>
                  {item.approvedAudiences && (
                    <span className="text-[10px] bg-slate-100 text-slate-600 font-mono px-2 py-0.5 rounded font-bold">
                      {item.approvedAudiences.join(', ')}
                    </span>
                  )}
                </div>
              </div>

              {/* Media Asset Preview */}
              {item.mediaAssets?.[0]?.url ? (
                <div className="bg-black aspect-video flex items-center justify-center overflow-hidden">
                  {item.type === 'REEL' || item.type === 'SHORT' ? (
                    <video src={item.mediaAssets[0].url} controls className="w-full h-full object-contain" />
                  ) : (
                    <img
                      src={item.mediaAssets[0].url}
                      alt={item.caption || 'Post image'}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              ) : (
                <div className="bg-slate-100 aspect-video flex items-center justify-center text-slate-400 font-medium text-sm">
                  🎨 {item.title || 'Creative Drawing'}
                </div>
              )}

              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <LikeButton
                      contentId={item.id}
                      initialLiked={item.userHasReacted || false}
                      initialCount={item.reactionCount || 0}
                    />
                  </div>

                  <button
                    onClick={() => setReportingContentId(item.id)}
                    title="Report content"
                    className="text-slate-400 hover:text-rose-500 transition-colors p-1"
                  >
                    <Flag className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-sm text-slate-700 leading-relaxed">
                  <strong className="text-slate-900 mr-1.5">@{item.author?.username}</strong>
                  {item.caption || item.title}
                </p>

                {/* Interactive Moderated Comments */}
                <CommentSection contentId={item.id} initialCount={item.commentCount || 0} />
              </div>
            </div>
          ))
        ) : (
          !isLoading &&
          isAuthenticated && (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-8">
              <p className="text-slate-400 font-medium text-sm">
                No approved posts available yet for your {ageGroup} age tier.
              </p>
            </div>
          )
        )}
      </div>

      {/* Child Reporting Modal */}
      {reportingContentId && (
        <ReportModal
          contentId={reportingContentId}
          isOpen={!!reportingContentId}
          onClose={() => setReportingContentId(null)}
        />
      )}
    </div>
  );
};
