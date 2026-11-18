import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Film, Send, AlertCircle, Layers } from 'lucide-react';
import { AgeGroup } from '@fizzy/shared-types';
import { MediaUploader } from '../components/MediaUploader';
import { apiClient } from '../services/api';

export const CreatePage: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'post' | 'reel'>('post');
  const [selectedAudiences, setSelectedAudiences] = useState<AgeGroup[]>([AgeGroup.EXPLORER]);
  const [titleOrCaption, setTitleOrCaption] = useState('');
  const [uploadedMedia, setUploadedMedia] = useState<{
    storageKey: string;
    previewUrl: string;
    mediaAssetId: string;
  } | null>(null);
  const [submittedResponse, setSubmittedResponse] = useState<any | null>(null);

  const toggleAudience = (tier: AgeGroup) => {
    setSelectedAudiences((prev) =>
      prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier]
    );
  };

  // Submit Post Mutation
  const createPostMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('/posts', {
        mediaAssetId: uploadedMedia!.mediaAssetId,
        caption: titleOrCaption,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setSubmittedResponse(data.data);
      queryClient.invalidateQueries({ queryKey: ['my-submissions'] });
    },
  });

  // Submit Reel Mutation
  const createReelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('/reels', {
        mediaAssetId: uploadedMedia!.mediaAssetId,
        title: titleOrCaption || 'Creative Reel',
        caption: titleOrCaption,
        requestedAudiences: selectedAudiences,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setSubmittedResponse(data.data);
      queryClient.invalidateQueries({ queryKey: ['my-submissions'] });
    },
  });

  const handleFinalSubmit = () => {
    if (!uploadedMedia) return;
    if (activeTab === 'post') {
      createPostMutation.mutate();
    } else {
      createReelMutation.mutate();
    }
  };

  const isPending = createPostMutation.isPending || createReelMutation.isPending;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-800">Create Safe Content</h1>
        <p className="text-sm text-slate-500">
          Upload photos and reels. All submissions undergo zero-trust administrator moderation before publication.
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="flex bg-slate-200 p-1 rounded-xl">
        <button
          onClick={() => {
            setActiveTab('post');
            setUploadedMedia(null);
          }}
          className={`flex-1 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all ${
            activeTab === 'post' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600'
          }`}
        >
          <Camera className="w-4 h-4" /> Photo Post
        </button>
        <button
          onClick={() => {
            setActiveTab('reel');
            setUploadedMedia(null);
          }}
          className={`flex-1 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all ${
            activeTab === 'reel' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600'
          }`}
        >
          <Film className="w-4 h-4" /> Short Video / Reel
        </button>
      </div>

      {submittedResponse ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center space-y-3">
          <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-2xl">
            🎉
          </div>
          <h2 className="text-xl font-bold text-emerald-800">Submitted for Review!</h2>
          <div className="p-3 bg-white rounded-xl border border-emerald-200 text-xs text-slate-700 font-mono inline-block">
            Status: <span className="font-bold text-amber-600">PENDING_REVIEW</span> (Private Quarantine)
          </div>
          <p className="text-xs text-emerald-700 leading-relaxed max-w-sm mx-auto">
            Your {activeTab === 'post' ? 'photo' : 'reel'} is safely stored in our quarantine vault. Once an administrator approves it, it will immediately appear in your friends' feeds!
          </p>
          <div className="pt-2">
            <button
              onClick={() => {
                setSubmittedResponse(null);
                setUploadedMedia(null);
                setTitleOrCaption('');
              }}
              className="text-xs font-bold text-emerald-800 underline hover:text-emerald-900"
            >
              Create another submission
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
          {/* Real Media Uploader Component */}
          <MediaUploader
            key={activeTab}
            mediaType={activeTab === 'post' ? 'IMAGE' : 'VIDEO'}
            onUploadSuccess={(media) => setUploadedMedia(media)}
          />

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {activeTab === 'post' ? 'Caption' : 'Reel Title & Description'}
            </label>
            <textarea
              rows={3}
              value={titleOrCaption}
              onChange={(e) => setTitleOrCaption(e.target.value)}
              placeholder="Write a kind caption for your friends..."
              className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Business Rules: Creator requested audience vs Post automatic audience */}
          {activeTab === 'reel' ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
                <Layers className="w-4 h-4 shrink-0" />
                Target Audience Selection (Mandatory for Reels & Shorts)
              </div>
              <p className="text-xs text-amber-700">
                Select the age tiers this video is intended for. The administrator will assign the final approved audience.
              </p>
              <div className="grid grid-cols-3 gap-2 pt-1">
                {[AgeGroup.JUNIOR, AgeGroup.EXPLORER, AgeGroup.TEEN].map((tier) => {
                  const isSelected = selectedAudiences.includes(tier);
                  return (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => toggleAudience(tier)}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-colors ${
                        isSelected
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {tier}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>Post Audience Rule:</strong> Creators do not select age groups for photo posts. Safe approved posts are assigned appropriate audiences by administrators.
              </span>
            </div>
          )}

          <button
            type="button"
            disabled={!uploadedMedia || isPending || (activeTab === 'reel' && selectedAudiences.length === 0)}
            onClick={handleFinalSubmit}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold py-3 rounded-xl shadow-md hover:from-purple-700 hover:to-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
            {isPending ? 'Sending to Queue...' : 'Submit for Administrator Review'}
          </button>
        </div>
      )}
    </div>
  );
};
