import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, LogIn, AlertCircle } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await apiClient.post('/auth/login', {
        usernameOrEmail,
        password,
      });

      if (res.data?.success && res.data?.data) {
        login(res.data.data.user, res.data.data.session?.token);
        navigate('/');
      }
    } catch (err: any) {
      setError(err?.message || 'Invalid username or password.');
    } finally {
      setIsLoading(false);
    }
  };

  // Quick Demo account prefill buttons
  const handleQuickLogin = (user: string) => {
    setUsernameOrEmail(user);
    setPassword('Password123!');
  };

  return (
    <div className="max-w-md mx-auto py-10 px-4">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-gradient-to-tr from-purple-600 to-pink-500 rounded-2xl flex items-center justify-center text-white text-2xl font-black mx-auto mb-3 shadow-md">
          F
        </div>
        <h1 className="text-2xl font-black text-slate-800">Welcome to Fizzy</h1>
        <p className="text-sm text-slate-500 mt-1">Safe, kind social media for kids & teens</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Username or Email
            </label>
            <input
              type="text"
              required
              value={usernameOrEmail}
              onChange={(e) => setUsernameOrEmail(e.target.value)}
              placeholder="e.g. maya_explorer"
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-3 rounded-xl shadow-md hover:from-purple-700 hover:to-pink-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" />
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div className="text-center pt-2">
          <p className="text-xs text-slate-500">
            Don't have an account yet?{' '}
            <Link to="/register" className="text-purple-600 font-bold hover:underline">
              Register here
            </Link>
          </p>
        </div>

        {/* Prototype Demo Logins */}
        <div className="pt-4 border-t border-slate-100">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 text-center">
            Demo Personas (Click to autofill)
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => handleQuickLogin('leo_lion_7')}
              className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-left font-medium"
            >
              🧒 Leo (Junior 7)
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('maya_explorer')}
              className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-left font-medium"
            >
              👧 Maya (Explorer 10)
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('jordan_teen_skater')}
              className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-left font-medium"
            >
              🛹 Jordan (Teen 15)
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('guardian_sarah')}
              className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-left font-medium"
            >
              👩‍👧 Sarah (Parent)
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('safety_admin')}
              className="col-span-2 p-2 border border-purple-200 bg-purple-50 text-purple-800 rounded-lg hover:bg-purple-100 text-center font-bold flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" /> Safety Admin
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
