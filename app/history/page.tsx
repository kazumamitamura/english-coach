'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';

// 履歴データの型定義
type HistoryItem = {
  date: string;
  explanation: string;
  advice: string;
};

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const initLiff = async () => {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      if (!liffId) {
        console.error("LIFF ID is missing");
        return;
      }

      try {
        // ▼ 修正箇所: TypeScriptの厳密なチェックを回避するために (window as any) を使用
        const liff = (window as any).liff;

        // LIFF SDKがまだロードされていない場合は読み込む
        if (!liff) {
            const script = document.createElement('script');
            script.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
            document.body.appendChild(script);
            
            // ロード完了を待つ
            await new Promise((resolve) => (script.onload = resolve));
            
            // ロード後に再度取得
            const loadedLiff = (window as any).liff;
            if (loadedLiff) {
                await loadedLiff.init({ liffId });
                handleLogin(loadedLiff);
            }
        } else {
            // 既にロードされている場合
            await liff.init({ liffId });
            handleLogin(liff);
        }

      } catch (err) {
        console.error(err);
        setError('LINEログインに失敗しました');
        setLoading(false);
      }
    };

    initLiff();
  }, []);

  // ログイン状態を確認して履歴を取得する関数
  const handleLogin = async (liff: any) => {
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }
    const profile = await liff.getProfile();
    fetchHistory(profile.userId);
  };

  const fetchHistory = async (userId: string) => {
    try {
      const res = await fetch(`/api/history?userId=${userId}`);
      if (!res.ok) throw new Error('データの取得に失敗しました');
      const data = await res.json();
      setHistory(data.history || []);
    } catch (err) {
      setError('履歴の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-amber-700">📚 学習の記録</h1>
          <Link href="/" className="text-sm bg-white border border-amber-600 text-amber-600 px-3 py-1 rounded hover:bg-amber-50">
            ← フォームに戻る
          </Link>
        </div>

        {loading && <p className="text-center py-10">読み込み中...</p>}
        {error && <p className="text-red-500 text-center">{error}</p>}

        {!loading && !error && history.length === 0 && (
          <div className="text-center py-10 bg-white rounded-lg shadow p-6">
            <p className="text-slate-500 mb-4">まだ履歴がありません。</p>
            <Link href="/" className="text-amber-600 font-bold underline">
              まずは課題を提出してみましょう！
            </Link>
          </div>
        )}

        <div className="space-y-6">
          {history.map((item, index) => (
            <div key={index} className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="bg-amber-50 px-4 py-2 border-b border-amber-100 flex justify-between">
                <span className="font-bold text-amber-800">提出日: {item.date}</span>
              </div>
              <div className="p-4">
                <div className="mb-4">
                  <h3 className="text-sm font-bold text-slate-500 mb-1">あなたの説明:</h3>
                  <p className="text-slate-800 bg-slate-50 p-3 rounded">{item.explanation}</p>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-500 mb-1">AI講師のアドバイス:</h3>
                  <div className="prose prose-sm max-w-none text-slate-700 bg-green-50 p-3 rounded border border-green-100">
                    <ReactMarkdown>{item.advice}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}