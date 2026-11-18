import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Layers, Clock, CheckCircle, XCircle, Sparkles } from 'lucide-react';

export const SubmissionsPage: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const { data: submissionsData, isLoading } = useQuery({
    queryKey: ['my-submissions'],
    queryFn: async () => {
      const res = await apiClient.get('/posts/my-submissions');
      return res.data;
    },
  });

  const submissions = submissionsData?.data || [];
  const filtered = submissions.filter((s: any) => {
    if (statusFilter === 'ALL') return true;
    return s.status === statusFilter;
  });

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="border-b border-slate-200 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            My Submissions & Moderation Track Record <Layers className="w-6 h-6 text-purple-600" />
          </h1>
          <p className="text-sm text-slate-500">
            Track safety reviews and approved status of all your creative posts and reels.
          </p>
        </div>

        {/* Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs"
        >
          <option value="ALL">All Statuses ({submissions.length})</option>
          <option value="PENDING_REVIEW">Pending Review</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Changes Needed</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-xs font-bold text-slate-400">Loading your submissions...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-2">
          <Sparkles className="w-10 h-10 text-purple-400 mx-auto" />
          <h2 className="font-bold text-slate-800 text-base">No submissions found</h2>
          <p className="text-xs text-slate-500">
            {statusFilter === 'ALL'
              ? 'You have not uploaded any creations yet. Tap "Create" to share your first post!'
              : `You have no submissions with status "${statusFilter}".`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((item: any) => {
            const isApproved = item.status === 'APPROVED' || item.status === 'PUBLISHED';
            const isRejected = item.status === 'REJECTED';

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                      {item.type}
                    </span>
                    <h3 className="font-bold text-sm text-slate-800">{item.title || 'Creative Creation'}</h3>
                  </div>

                  <div>
                    {isApproved ? (
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-800 font-bold rounded-full text-xs flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5" /> Approved & Published
                      </span>
                    ) : isRejected ? (
                      <span className="px-3 py-1 bg-rose-100 text-rose-800 font-bold rounded-full text-xs flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5" /> Changes Needed
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-amber-100 text-amber-800 font-bold rounded-full text-xs flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> {item.status.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Caption / Content preview */}
                <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  {item.caption || 'No caption provided.'}
                </p>

                {/* Audiences information if Short / Reel */}
                {item.requestedAudiences?.length > 0 && (
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span>Requested Audiences:</span>
                    <strong className="font-mono text-purple-700">
                      {item.requestedAudiences.map((a: any) => a.ageGroup).join(', ')}
                    </strong>
                  </div>
                )}

                <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-slate-50">
                  <span>Submitted on {new Date(item.createdAt).toLocaleDateString()}</span>
                  <span>ID: #{item.id.slice(0, 8)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
