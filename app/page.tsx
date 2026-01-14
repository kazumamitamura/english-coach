'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

declare global {
  interface Window {
    liff?: {
      init: (config: { liffId: string }) => Promise<void>;
      getProfile: () => Promise<{ userId: string; displayName: string; pictureUrl?: string }>;
      isLoggedIn: () => boolean;
    };
  }
}

export default function Home() {
  const [userId, setUserId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');
  
  // 修正箇所1: school を削除し、grade (学年) と targetSchool (志望校) を追加
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    grade: '',        // 学年
    targetSchool: '', // 志望校
    explanation: '',
  });

  useEffect(() => {
    // LINE LIFF初期化
    const initLiff = async () => {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      if (!liffId || !window.liff) {
        console.warn('LIFF is not available');
        return;
      }

      try {
        await window.liff.init({ liffId });
        if (window.liff.isLoggedIn()) {
          const profile = await window.liff.getProfile();
          setUserId(profile.userId);
        }
      } catch (err) {
        console.error('LIFF initialization error:', err);
      }
    };

    // LIFF SDKを読み込む
    const script = document.createElement('script');
    script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
    script.onload = initLiff;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult('');

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          userId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '分析に失敗しました');
      }

      const data = await response.json();
      setResult(data.markdown || data.result || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-amber-700 mb-2">
            英語仮定法 理解度チェック
          </h1>

          {/* ▼▼▼ 追加するコード ▼▼▼ */}
          <p className="text-xs text-gray-400 font-mono mb-2">
             DEBUG: UserID = {userId ? userId : "取得できていません"}
          </p>
          {/* ▲▲▲ 追加ここまで ▲▲▲ */}


          <p className="text-slate-600">
            AI講師があなたの説明を採点・添削します
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-6 space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-2">
              氏名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              id="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>

          {/* 修正箇所2: 学年と志望校の入力欄を分離 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="grade" className="block text-sm font-medium text-slate-700 mb-2">
                学年 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="grade"
                required
                placeholder="例: 高校2年生"
                value={formData.grade}
                onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>

            <div>
              <label htmlFor="targetSchool" className="block text-sm font-medium text-slate-700 mb-2">
                志望校 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="targetSchool"
                required
                placeholder="例: ○○大学"
                value={formData.targetSchool}
                onChange={(e) => setFormData({ ...formData, targetSchool: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="explanation" className="block text-sm font-medium text-slate-700 mb-2">
              課題: 仮定法とは何か、自分の言葉で説明してください <span className="text-red-500">*</span>
            </label>
            <textarea
              id="explanation"
              required
              rows={8}
              value={formData.explanation}
              onChange={(e) => setFormData({ ...formData, explanation: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-y"
              placeholder="ここにあなたの説明を記入してください..."
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-md transition-colors disabled:bg-amber-400 disabled:cursor-not-allowed"
          >
            {loading ? '分析中...' : '送信して分析する'}
          </button>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
              {error}
            </div>
          )}
        </form>

        {result && (
          <div className="mt-6 bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold text-amber-700 mb-4">分析結果</h2>
            <div className="prose prose-slate max-w-none">
              <ReactMarkdown>{result}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}