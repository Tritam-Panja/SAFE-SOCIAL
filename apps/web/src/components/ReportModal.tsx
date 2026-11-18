import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Flag, CheckCircle2 } from 'lucide-react';

interface ReportModalProps {
  contentId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({ contentId, isOpen, onClose }) => {
  const [reason, setReason] = useState('Inappropriate language');
  const [details, setDetails] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const reportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('/reports', {
        contentId,
        reason,
        details: details.trim() || undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      setFeedback('Thank you for helping keep Fizzy safe! Our moderators are reviewing this item.');
      setTimeout(() => {
        setFeedback(null);
        onClose();
      }, 3000);
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
          <Flag className="w-5 h-5 text-rose-600" />
          <h3 className="font-extrabold text-sm text-slate-800">Report Inappropriate Content</h3>
        </div>

        {feedback ? (
          <div className="p-4 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{feedback}</span>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              reportMutation.mutate();
            }}
            className="space-y-3 text-xs"
          >
            <div>
              <label className="font-bold text-slate-700 block mb-1">Select a Reason:</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium"
              >
                <option value="Inappropriate language">Inappropriate language</option>
                <option value="Bullying or mean behavior">Bullying or mean behavior</option>
                <option value="Contains personal contact info">Contains personal contact info</option>
                <option value="Scary or not child safe">Scary or not child safe</option>
                <option value="Spam or advertising">Spam or advertising</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Optional Details:</label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={2}
                placeholder="Help our safety team understand what happened..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2"
                maxLength={300}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 font-semibold text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reportMutation.isPending}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold rounded-xl transition-colors"
              >
                {reportMutation.isPending ? 'Sending...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
