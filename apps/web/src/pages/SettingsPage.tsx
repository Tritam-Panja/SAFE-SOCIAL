import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Settings, Bell, Lock, Info, CheckCircle2 } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { user, ageGroup, role } = useAuth();
  const [feedback, setFeedback] = useState<string | null>(null);

  const [soundEffects, setSoundEffects] = useState(true);
  const [highContrast, setHighContrast] = useState(false);

  const handleSave = () => {
    setFeedback('Preferences saved for this device!');
    setTimeout(() => setFeedback(null), 3000);
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="border-b border-slate-200 pb-3">
        <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          App Settings & Safety Information <Settings className="w-6 h-6 text-purple-600" />
        </h1>
        <p className="text-sm text-slate-500">
          Account details, accessibility preferences, and child privacy protections.
        </p>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Account Info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Info className="w-4 h-4 text-purple-600" /> Account Summary
        </h2>
        <div className="grid sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-slate-400 block text-[10px] font-bold uppercase">Username</span>
            <span className="font-bold text-slate-800 text-sm">@{user?.username}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-slate-400 block text-[10px] font-bold uppercase">Age Tier</span>
            <span className="font-bold text-purple-700 text-sm">{ageGroup} Tier</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-slate-400 block text-[10px] font-bold uppercase">Account Role</span>
            <span className="font-bold text-slate-800">{role}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <span className="text-slate-400 block text-[10px] font-bold uppercase">Safety Status</span>
            <span className="font-bold text-emerald-600">Active & Protected</span>
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4 text-xs">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Bell className="w-4 h-4 text-purple-600" /> Kid-Friendly Preferences
        </h2>

        <div className="space-y-3">
          <label className="flex items-center justify-between cursor-pointer p-3 bg-slate-50 rounded-xl">
            <div className="space-y-0.5">
              <span className="font-bold text-slate-800 block">Sound Effects</span>
              <span className="text-slate-500 text-[11px]">Play chime sounds on new likes and alerts</span>
            </div>
            <input
              type="checkbox"
              checked={soundEffects}
              onChange={(e) => setSoundEffects(e.target.checked)}
              className="w-5 h-5 accent-purple-600 rounded cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer p-3 bg-slate-50 rounded-xl">
            <div className="space-y-0.5">
              <span className="font-bold text-slate-800 block">High Contrast Mode</span>
              <span className="text-slate-500 text-[11px]">Enhance contrast for easier reading</span>
            </div>
            <input
              type="checkbox"
              checked={highContrast}
              onChange={(e) => setHighContrast(e.target.checked)}
              className="w-5 h-5 accent-purple-600 rounded cursor-pointer"
            />
          </label>
        </div>

        <button
          onClick={handleSave}
          className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-colors shadow-xs"
        >
          Save Preferences
        </button>
      </div>

      {/* Safety & Guardian Assurance */}
      <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5 text-xs text-purple-900 space-y-2">
        <h3 className="font-bold flex items-center gap-1.5 text-sm">
          <Lock className="w-4 h-4 text-purple-600" /> Kid-Safe Privacy Promise
        </h3>
        <p className="text-[11px] text-purple-800 leading-relaxed">
          Fizzy never sells your personal information or exposes your private contact information. Every photo, video, and comment submitted is verified safe by our moderation team before appearing to other children.
        </p>
      </div>
    </div>
  );
};
