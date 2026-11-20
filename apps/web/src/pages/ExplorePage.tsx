import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Compass, Search, Sparkles } from 'lucide-react';
import { LikeButton } from '../components/LikeButton';
import { CommentSection } from '../components/CommentSection';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { RealtimeEvent } from '@fizzy/shared-types';

export const ExplorePage: React.FC = () => {
  const { ageGroup, isAuthenticated } = useAuth();
  const { on } = useRealtime();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'POST' | 'REEL'>('ALL');

  // Fetch approved community content
  const { data: feedData, isLoading } = useQuery({
    queryKey: ['explore-feed', ageGroup, selectedCategory],
    queryFn: async () => {
      const typeParam = selectedCategory !== 'ALL' ? `?type=${selectedCategory}` : '';
      const res = await apiClient.get(`/feed${typeParam}`);
      return res.data;
    },
    enabled: isAuthenticated,
  });

  // Real-time listener for feed updates
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribe = on(RealtimeEvent.FEED_UPDATED, (payload) => {
      console.log('[Explore] Real-time feed update received:', payload);
      queryClient.invalidateQueries({ queryKey: ['explore-feed', ageGroup] });
    });

    return unsubscribe;
  }, [on, isAuthenticated, ageGroup, queryClient]);

  const allItems = feedData?.data || [];
  const filtered = allItems.filter((item: any) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.title?.toLowerCase().includes(term) ||
      item.caption?.toLowerCase().includes(term) ||
      item.author?.username?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b border-slate-200 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            Explore & Discover <Compass className="w-6 h-6 text-purple-600" />
          </h1>
          <p className="text-sm text-slate-500">
            Discover creative art, science projects, and hobbies vetted for <strong className="text-purple-600">{ageGroup}</strong> tier.
          </p>
        </div>

        {/* Category Pills */}
        <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              selectedCategory === 'ALL' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            All Creations
          </button>
          <button
            onClick={() => setSelectedCategory('POST')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              selectedCategory === 'POST' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            Photos & Art
          </button>
          <button
            onClick={() => setSelectedCategory('REEL')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              selectedCategory === 'REEL' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            Short Videos
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search topics, drawings, science, or creators..."
          className="w-full pl-10 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl shadow-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
        />
      </div>

      {/* Grid of Creations */}
      {isLoading ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs font-bold text-slate-400">Exploring safe creations...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-2">
          <Sparkles className="w-10 h-10 text-purple-400 mx-auto" />
          <h2 className="font-bold text-slate-800 text-base">No creations matched your search</h2>
          <p className="text-xs text-slate-500">Try searching for other topics or switch categories!</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((item: any) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between"
            >
              <div>
                {/* Media Preview */}
                <div className="bg-slate-900 aspect-video relative flex items-center justify-center overflow-hidden">
                  {item.mediaAssets?.[0]?.url ? (
                    item.type === 'REEL' || item.type === 'SHORT' ? (
                      <video src={item.mediaAssets[0].url} className="w-full h-full object-cover" />
                    ) : (
                      <img src={item.mediaAssets[0].url} alt="media" className="w-full h-full object-cover" />
                    )
                  ) : (
                    <span className="text-2xl">🎨</span>
                  )}
                  <span className="absolute top-2 left-2 bg-black/60 backdrop-blur-xs text-white text-[9px] font-mono font-bold px-2 py-0.5 rounded">
                    {item.type}
                  </span>
                </div>

                {/* Content Details */}
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-800">@{item.author?.username}</span>
                    <span className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-bold">
                      {item.author?.ageGroup} Tier
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2">
                    {item.caption || item.title || 'Creative post'}
                  </p>
                </div>
              </div>

              {/* Interactions */}
              <div className="p-4 pt-0 space-y-2 border-t border-slate-50 mt-2">
                <div className="flex items-center gap-2 pt-2">
                  <LikeButton
                    contentId={item.id}
                    initialLiked={item.userHasReacted || false}
                    initialCount={item.reactionCount || 0}
                  />
                </div>
                <CommentSection contentId={item.id} initialCount={item.commentCount || 0} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
