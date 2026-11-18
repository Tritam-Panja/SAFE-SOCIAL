import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import {
  ShieldCheck,
  CheckCircle2,
  Flag,
  FileText,
  Activity,
  Layers,
} from 'lucide-react';

export const ModerationPage: React.FC = () => {
  const queryClient = useQueryClient();

  // Tab State
  const [activeTab, setActiveTab] = useState<'queue' | 'reports' | 'audit'>('queue');

  // Filter States for Queue
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('PENDING_REVIEW');

  // Decision Modal State
  const [reviewItem, setReviewItem] = useState<any | null>(null);
  const [selectedAudiences, setSelectedAudiences] = useState<string[]>([]);
  const [reviewReason, setReviewReason] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  // Report Resolution State
  const [resolvingReport, setResolvingReport] = useState<any | null>(null);
  const [reportActionTaken, setReportActionTaken] = useState('');

  // 1. Fetch Admin Metrics (Live DB counts)
  const { data: dashboardData } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/dashboard');
      return res.data;
    },
  });

  // 2. Fetch Moderation Queue
  const { data: queueData, isLoading: loadingQueue } = useQuery({
    queryKey: ['moderation-queue', typeFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typeFilter !== 'ALL') params.append('type', typeFilter);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      const res = await apiClient.get(`/moderation/queue?${params.toString()}`);
      return res.data;
    },
    enabled: activeTab === 'queue',
  });

  // 3. Fetch Reports List
  const { data: reportsData, isLoading: loadingReports } = useQuery({
    queryKey: ['admin-reports'],
    queryFn: async () => {
      const res = await apiClient.get('/reports?status=ALL');
      return res.data;
    },
    enabled: activeTab === 'reports',
  });

  // 4. Fetch Audit Logs
  const { data: auditData, isLoading: loadingAudit } = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/audit-logs');
      return res.data;
    },
    enabled: activeTab === 'audit',
  });

  // 5. Apply Review Decision Mutation
  const decisionMutation = useMutation({
    mutationFn: async ({
      contentId,
      decision,
      reason,
      internalNotes,
      approvedAudiences,
    }: any) => {
      const res = await apiClient.post(`/moderation/${contentId}/review`, {
        decision,
        reason,
        internalNotes,
        approvedAudiences: approvedAudiences.length > 0 ? approvedAudiences : undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      setReviewItem(null);
      setReviewReason('');
      setInternalNotes('');
      setSelectedAudiences([]);
      queryClient.invalidateQueries({ queryKey: ['moderation-queue'] });
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    },
  });

  // 6. Resolve Report Mutation
  const resolveReportMutation = useMutation({
    mutationFn: async ({ reportId, status, actionTaken }: any) => {
      const res = await apiClient.patch(`/reports/${reportId}/resolve`, {
        status,
        actionTaken,
      });
      return res.data;
    },
    onSuccess: () => {
      setResolvingReport(null);
      setReportActionTaken('');
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    },
  });

  const openReviewModal = (item: any) => {
    setReviewItem(item);
    // Default audiences to requested audiences for reels/shorts
    const requested = item.requestedAudiences?.map((a: any) => a.ageGroup) || [];
    setSelectedAudiences(requested);
  };

  const metrics = dashboardData?.data?.metrics || {
    totalUsers: 0,
    childUsers: 0,
    parentUsers: 0,
    pendingSubmissions: 0,
    approvedContent: 0,
    rejectedContent: 0,
    reportedContent: 0,
  };

  const queueItems = queueData?.data || [];
  const reports = reportsData?.data || [];
  const auditLogs = auditData?.data || [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="border-b border-slate-200 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            Admin Safety Center & Operations <ShieldCheck className="w-6 h-6 text-purple-600" />
          </h1>
          <p className="text-sm text-slate-500">
            Mandatory Zero-Trust human verification, child safety reports, and immutable audit logs.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'queue' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" /> Queue ({metrics.pendingSubmissions})
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'reports' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Flag className="w-4 h-4 text-rose-500" /> Reports ({metrics.reportedContent})
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'audit' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" /> Audit Log
          </button>
        </div>
      </div>

      {/* Live Aggregated Real Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Total Users</p>
          <p className="text-lg font-black text-slate-800">{metrics.totalUsers}</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold text-purple-600 uppercase">Child Accounts</p>
          <p className="text-lg font-black text-purple-700">{metrics.childUsers}</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold text-indigo-600 uppercase">Parents</p>
          <p className="text-lg font-black text-indigo-700">{metrics.parentUsers}</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-amber-200 bg-amber-50/30 shadow-xs">
          <p className="text-[10px] font-bold text-amber-700 uppercase">Pending Queue</p>
          <p className="text-lg font-black text-amber-800">{metrics.pendingSubmissions}</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-xs">
          <p className="text-[10px] font-bold text-emerald-700 uppercase">Approved</p>
          <p className="text-lg font-black text-emerald-800">{metrics.approvedContent}</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] font-bold text-slate-500 uppercase">Rejected</p>
          <p className="text-lg font-black text-slate-700">{metrics.rejectedContent}</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-rose-200 bg-rose-50/30 shadow-xs">
          <p className="text-[10px] font-bold text-rose-700 uppercase">Active Reports</p>
          <p className="text-lg font-black text-rose-800">{metrics.reportedContent}</p>
        </div>
      </div>

      {/* TAB 1: MODERATION QUEUE */}
      {activeTab === 'queue' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-600">Content Type:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-medium"
              >
                <option value="ALL">All Types</option>
                <option value="POST">Photo Posts</option>
                <option value="SHORT">Shorts</option>
                <option value="REEL">Reels</option>
                <option value="COMMENT">Comments</option>
                <option value="PROFILE_PHOTO">Avatars</option>
                <option value="PROFILE_BIO">Bios</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-600">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-medium"
              >
                <option value="PENDING_REVIEW">Pending Review</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="ALL">All Statuses</option>
              </select>
            </div>
          </div>

          {/* Queue Items List */}
          {loadingQueue ? (
            <p className="text-xs text-slate-400 py-6 text-center">Loading moderation queue...</p>
          ) : queueItems.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-2">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <h2 className="font-bold text-slate-800 text-lg">Queue Clear!</h2>
              <p className="text-sm text-slate-500">All submitted items have been reviewed.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {queueItems.map((item: any) => (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-slate-100 font-mono px-2 py-0.5 rounded font-bold text-slate-600">
                        {item.type}
                      </span>
                      <span className="text-sm font-bold text-slate-800">@{item.author?.username}</span>
                      <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-semibold">
                        {item.author?.ageGroup} Tier
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-800">
                        {item.caption || item.title || 'Submission item'}
                      </p>
                      {item.requestedAudiences?.length > 0 && (
                        <p className="text-xs text-amber-700 flex items-center gap-1 font-medium">
                          <span>Creator Requested Audiences:</span>
                          <strong className="font-mono">
                            {item.requestedAudiences.map((a: any) => a.ageGroup).join(', ')}
                          </strong>
                        </p>
                      )}
                    </div>

                    {item.mediaAssets?.[0]?.url && (
                      <div className="w-24 h-16 bg-black rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                        <img
                          src={item.mediaAssets[0].url}
                          alt="preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => openReviewModal(item)}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                    >
                      <ShieldCheck className="w-4 h-4" /> Review & Make Decision
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: REPORTS */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          {loadingReports ? (
            <p className="text-xs text-slate-400 py-6 text-center">Loading reports...</p>
          ) : reports.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-xs italic">
              No reports filed yet. The community is safe and kind!
            </div>
          ) : (
            <div className="grid gap-3">
              {reports.map((r: any) => (
                <div
                  key={r.id}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          r.status === 'PENDING'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {r.status}
                      </span>
                      <span className="font-bold text-xs text-slate-800">Reported by @{r.reporter?.username}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-rose-700">Reason: {r.reason}</p>
                    {r.details && <p className="text-xs text-slate-600">Details: "{r.details}"</p>}
                    {r.actionTaken && (
                      <p className="text-[11px] text-emerald-700 font-medium">Action Taken: {r.actionTaken}</p>
                    )}
                  </div>

                  {r.status === 'PENDING' && (
                    <button
                      onClick={() => setResolvingReport(r)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shrink-0"
                    >
                      Resolve Report
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AUDIT LOG */}
      {activeTab === 'audit' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-purple-600" /> Administrative & Safety Audit Log
          </h2>

          {loadingAudit ? (
            <p className="text-xs text-slate-400 py-4">Loading audit logs...</p>
          ) : auditLogs.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-4">No audit entries recorded yet.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {auditLogs.map((log: any) => (
                <div
                  key={log.id}
                  className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-mono font-bold text-purple-700">{log.action}</span>
                    <span className="text-slate-400 ml-2 font-mono text-[10px]">
                      {log.entityType} #{log.entityId.slice(0, 8)}
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Actor: <strong>@{log.actor?.username || 'system'}</strong> ({log.actor?.role || 'SYSTEM'})
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODERATION DECISION MODAL */}
      {reviewItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-purple-600" /> Review Content Submission
              </h3>
              <button
                onClick={() => setReviewItem(null)}
                className="text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                Close
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <div>Creator: <strong>@{reviewItem.author?.username}</strong> ({reviewItem.author?.ageGroup} Tier)</div>
                <div>Type: <strong className="font-mono">{reviewItem.type}</strong></div>
                <div>Caption: <em>"{reviewItem.caption || reviewItem.title || 'None'}"</em></div>
              </div>

              {/* Audience selection for Shorts and Reels */}
              {(reviewItem.type === 'SHORT' || reviewItem.type === 'REEL') && (
                <div className="space-y-1.5 p-3 bg-purple-50 rounded-xl border border-purple-200">
                  <label className="font-bold text-purple-900 block">
                    Approved Audiences (Select from requested: {reviewItem.requestedAudiences?.map((a: any) => a.ageGroup).join(', ')})
                  </label>
                  <div className="flex gap-2">
                    {['JUNIOR', 'EXPLORER', 'TEEN'].map((tier) => (
                      <label key={tier} className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedAudiences.includes(tier)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedAudiences([...selectedAudiences, tier]);
                            } else {
                              setSelectedAudiences(selectedAudiences.filter((t) => t !== tier));
                            }
                          }}
                          className="accent-purple-600 rounded"
                        />
                        <span>{tier}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Feedback reason */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">Kid-Facing Feedback Reason:</label>
                <input
                  type="text"
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  placeholder="e.g. Looks great! Or: Please remove visible phone number."
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              {/* Internal Moderator Notes */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">
                  Internal Review Notes (Confidential, never visible to kids):
                </label>
                <input
                  type="text"
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="e.g. Inspected background for PII; checked audio safety."
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() =>
                  decisionMutation.mutate({
                    contentId: reviewItem.id,
                    decision: 'REQUEST_CHANGES',
                    reason: reviewReason || 'Please make a small safety edit and resubmit.',
                    internalNotes,
                    approvedAudiences: selectedAudiences,
                  })
                }
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold"
              >
                Request Changes
              </button>
              <button
                onClick={() =>
                  decisionMutation.mutate({
                    contentId: reviewItem.id,
                    decision: 'REJECT',
                    reason: reviewReason || 'Does not meet our child safety community guidelines.',
                    internalNotes,
                    approvedAudiences: selectedAudiences,
                  })
                }
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold"
              >
                Reject Content
              </button>
              <button
                onClick={() =>
                  decisionMutation.mutate({
                    contentId: reviewItem.id,
                    decision: 'APPROVE',
                    reason: reviewReason || 'Verified safe for publication.',
                    internalNotes,
                    approvedAudiences: selectedAudiences,
                  })
                }
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
              >
                Approve & Publish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESOLVE REPORT MODAL */}
      {resolvingReport && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Flag className="w-5 h-5 text-rose-600" /> Resolve Safety Report
            </h3>
            <p className="text-xs text-slate-600">
              Reported for: <strong>"{resolvingReport.reason}"</strong>
            </p>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">Action Taken (Recorded in audit history):</label>
              <textarea
                value={reportActionTaken}
                onChange={(e) => setReportActionTaken(e.target.value)}
                rows={2}
                placeholder="e.g. Content reviewed and verified safe; reporter informed."
                className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setResolvingReport(null)}
                className="px-3 py-1.5 text-xs text-slate-600 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  resolveReportMutation.mutate({
                    reportId: resolvingReport.id,
                    status: 'DISMISSED',
                    actionTaken: reportActionTaken || 'Report dismissed as false alarm.',
                  })
                }
                className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold"
              >
                Dismiss Report
              </button>
              <button
                onClick={() =>
                  resolveReportMutation.mutate({
                    reportId: resolvingReport.id,
                    status: 'RESOLVED',
                    actionTaken: reportActionTaken || 'Safety action taken and confirmed.',
                  })
                }
                disabled={!reportActionTaken.trim()}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold"
              >
                Mark Resolved
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
