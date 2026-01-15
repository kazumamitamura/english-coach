# 🎓 AI英語コーチングアプリ (AI English Coach)

## 📖 概要
「自分の志望校と学年に合わせた、的確な仮定法の添削が欲しい」というニーズに応えるため、Google Gemini (AI) を活用した英語学習Webアプリケーションです。
LINEのLIFFアプリとして動作し、ユーザーはスマホから手軽に英作文を提出。AIによる即時採点・解説に加え、学習履歴の管理機能も備えています。

## 🚀 デモ・リンク
- **App URL:** [https://english-coach-xxxxx.vercel.app](https://english-coach-xxxxx.vercel.app)
- **Tech Stack:** Next.js, TypeScript, Google Gemini API, LINE Messaging API

## 🛠 使用技術
- **Frontend:** Next.js (App Router), React, Tailwind CSS
- **Backend:** Next.js API Routes
- **AI Model:** Google Gemini 1.5 Flash
- **Database:** Google Sheets (via google-spreadsheet)
- **Platform:** Vercel
- **Interface:** LINE LIFF, Messaging API
- **Others:** Nodemailer (Email通知)

## ⚙️ システムアーキテクチャ
1. **User:** LINE上のLIFFアプリからフォーム入力（氏名、学年、志望校、回答）。
2. **App:** Next.jsがGemini APIにプロンプト（「予備校のカリスマ講師」ペルソナ）を送信。
3. **AI:** 採点、修正、解説、入試のポイントを生成。
4. **DB:** Googleスプレッドシートに日時・ユーザーID・回答・添削結果を自動保存。
5. **Notification:** - LINE Messaging APIを通じて、採点完了通知と履歴ページへのリンクを送信。
   - Nodemailerを通じて、詳細な解説をメール送信。

## ✨ 主な機能
- **パーソナライズ添削:** 志望校（例：難関国立、私大）や学年に応じて、AIが指導トーンや解説レベルを調整。
- **履歴振り返り機能:** 過去の添削結果をユーザーIDに基づいてフィルタリングし、一覧表示。
- **マルチチャネル通知:** 即時性の高いLINE通知と、保存性の高いメール通知の併用。

## 🐛 開発における課題と解決策 (Troubleshooting)

### 1. Next.js App Routerのディレクトリ構造によるビルドエラー
- **課題:** `app/history` ディレクトリ内に `page.tsx`（画面）と `route.ts`（API）を同居させたため、ビルド時に `You cannot have two parallel pages` エラーが発生。
- **解決:** APIロジックを `app/api/history/route.ts` に分離し、責務を明確化することで解決。

### 2. Google Gemini APIのRate Limit制限
- **課題:** 開発中に `429 Too Many Requests` エラーが発生。当初 `gemini-2.0-flash` (Preview) を使用していたが、Quota制限に抵触。
- **解決:** 安定稼働する `gemini-1.5-flash` モデルへ切り替えを行い、エラーを解消。

### 3. Google Sheets APIの認証エラー
- **課題:** 秘密鍵（Private Key）の改行コードの扱いや、スプレッドシートの権限設定（Service Accountへの共有忘れ）により書き込みに失敗。
- **解決:** 環境変数の適切な設定と、エラーログ（Vercel Logs）に基づいた権限付与の徹底。

## 📦 ローカルでの実行方法
1. リポジトリをクローン
\`\`\`bash
git clone https://github.com/yourusername/english-coach.git
\`\`\`
2. パッケージのインストール
\`\`\`bash
npm install
\`\`\`
3. 環境変数の設定 (`.env.local`)
4. 開発サーバー起動
\`\`\`bash
npm run dev
\`\`\`

