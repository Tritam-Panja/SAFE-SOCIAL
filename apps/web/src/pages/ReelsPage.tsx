import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../services/api';
import { Film, Sparkles, AlertCircle, Eye, ChevronUp, ChevronDown } from 'lucide-react';
import { LikeButton } from '../components/LikeButton';
import { CommentSection } from '../components/CommentSection';

export const ReelsPage: React.FC = () => {
  const { ageGroup, isAuthenticated } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);

  // 1. Fetch real reels feed filtered at database level for user's ageGroup
  const { data: reelsData, isLoading, error } = useQuery({
    queryKey: ['reels-feed', ageGroup],
    queryFn: async () => {
      const res = await apiClient.get('/reels/feed');
      return res.data;
    },
    enabled: isAuthenticated,
  });

  const reels = reelsData?.data || [];
  const currentReel = reels[currentIndex];

  const handleNext = () => {
    if (currentIndex < reels.length - 1) setCurrentIndex(currentIndex + 1);
  };

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  return (
    <div className="space-y-4 max-w-md mx-auto">
      <div className="text-center pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center justify-center gap-2">
          Shorts & Reels <Film className="w-6 h-6 text-purple-600" />
        </h1>
        <p className="text-xs text-slate-500">
          Showing vetted educational & creative clips for <strong className="text-purple-600">{ageGroup}</strong> tier.
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-20">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs font-bold text-slate-400">Loading age-filtered reels...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Could not load reels. Your parent may have restricted shorts/reels.</span>
        </div>
      ) : reels.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center space-y-2">
          <Sparkles className="w-10 h-10 text-purple-400 mx-auto" />
          <h2 className="font-bold text-slate-800 text-base">No Reels in {ageGroup} Tier Yet</h2>
          <p className="text-xs text-slate-500">
            Be the first to upload a short educational video from the Create tab!
          </p>
        </div>
      ) : (
        <div className="relative aspect-[9/16] bg-black rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between border-4 border-purple-500/20">
          {/* Top Info Bar */}
          <div className="p-4 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between text-white z-10">
            <span className="bg-emerald-500/80 backdrop-blur-xs text-[10px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
              <Eye className="w-3 h-3" /> Approved: {currentReel.approvedAudiences?.join(', ')}
            </span>
            <span className="text-xs text-slate-300 font-mono">
              {currentIndex + 1} / {reels.length}
            </span>
          </div>

          {/* Video Player */}
          {currentReel.mediaAssets?.[0]?.url ? (
            <video
              key={currentReel.id}
              src={currentReel.mediaAssets[0].url}
              controls
              autoPlay
              loop
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/50 font-bold text-sm">
              🎬 {currentReel.title}
            </div>
          )}

          {/* Bottom Details & Interaction Overlay */}
          <div className="p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent text-white space-y-3 z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 flex items-center justify-center font-bold text-xs text-white">
                  {currentReel.author?.username?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-xs">@{currentReel.author?.username}</p>
                  <p className="text-[10px] text-purple-300 font-medium">{currentReel.author?.ageGroup} Tier</p>
                </div>
              </div>

              {/* Like Button */}
              <div className="flex items-center gap-2">
                <LikeButton
                  contentId={currentReel.id}
                  initialLiked={currentReel.userHasReacted || false}
                  initialCount={currentReel.reactionCount || 0}
                />
              </div>
            </div>

            <p className="text-xs text-slate-200 leading-relaxed font-medium">
              {currentReel.caption || currentReel.title}
            </p>

            {/* Moderated Comments on Reel */}
            <div className="pt-1">
              <CommentSection contentId={currentReel.id} initialCount={currentReel.commentCount || 0} />
            </div>

            {/* Up / Down Navigation Controls */}
            <div className="flex justify-between items-center pt-2 border-t border-white/10 text-xs">
              <button
                onClick={handlePrev}
                disabled={currentIndex === 0}
                className="disabled:opacity-30 flex items-center gap-1 font-bold text-slate-300 hover:text-white"
              >
                <ChevronUp className="w-4 h-4" /> Previous
              </button>
              <button
                onClick={handleNext}
                disabled={currentIndex === reels.length - 1}
                className="disabled:opacity-30 flex items-center gap-1 font-bold text-slate-300 hover:text-white"
              >
                Next <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
