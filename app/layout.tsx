import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '英語仮定法 理解度チェック',
  description: 'AI講師があなたの英語仮定法の説明を採点・添削します',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
