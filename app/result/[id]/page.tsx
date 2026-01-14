import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || '';
const SHEET_NAME = 'Responses';
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') || '';

interface ResultData {
  id: string;
  日時: string;
  氏名: string;
  Email: string;
  志望校: string;
  生徒の説明: string;
  AIアドバイス: string;
}

async function getResultData(id: string): Promise<ResultData | null> {
  try {
    const auth = new JWT({
      email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: GOOGLE_PRIVATE_KEY,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, auth);
    await doc.loadInfo();

    const sheet = doc.sheetsByTitle[SHEET_NAME];
    if (!sheet) {
      return null;
    }

    await sheet.loadHeaderRow();
    const rows = await sheet.getRows();

    const row = rows.find((r) => r.get('ID') === id);
    if (!row) {
      return null;
    }

    return {
      id: row.get('ID'),
      日時: row.get('日時'),
      氏名: row.get('氏名'),
      Email: row.get('Email'),
      志望校: row.get('志望校'),
      生徒の説明: row.get('生徒の説明'),
      AIアドバイス: row.get('AIアドバイス'),
    };
  } catch (error) {
    console.error('Error fetching result:', error);
    return null;
  }
}

export default async function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getResultData(id);

  if (!data) {
    notFound();
  }

  // 採点を抽出（表示用）
  const scoreMatch = data.AIアドバイス.match(/(\d+)\s*点/i) || 
                     data.AIアドバイス.match(/採点[^\n]*(\d+)/i);
  const score = scoreMatch ? scoreMatch[1] : null;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-amber-700 mb-2">
            採点結果
          </h1>
          <p className="text-slate-600">
            {data.氏名} 様の結果
          </p>
        </div>

        {/* 成績表風のUI */}
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg shadow-lg p-6 mb-6 border-2 border-amber-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-amber-800">評価結果</h2>
              <p className="text-slate-600">提出日: {new Date(data.日時).toLocaleString('ja-JP')}</p>
            </div>
            {score && (
              <div className="text-center">
                <div className="text-5xl font-bold text-amber-700">{score}</div>
                <div className="text-lg text-slate-600">点</div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="bg-white rounded p-4">
              <div className="text-sm text-slate-500">志望校・学年</div>
              <div className="font-semibold text-slate-800">{data.志望校}</div>
            </div>
            <div className="bg-white rounded p-4">
              <div className="text-sm text-slate-500">Email</div>
              <div className="font-semibold text-slate-800">{data.Email}</div>
            </div>
          </div>
        </div>

        {/* 生徒の説明 */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-amber-700 mb-4">あなたの説明</h2>
          <div className="bg-slate-50 rounded p-4 border border-slate-200">
            <p className="whitespace-pre-wrap text-slate-800">{data.生徒の説明}</p>
          </div>
        </div>

        {/* AIアドバイス */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-amber-700 mb-4">AI講師からのアドバイス</h2>
          <div className="prose prose-slate max-w-none">
            <ReactMarkdown>{data.AIアドバイス}</ReactMarkdown>
          </div>
        </div>

        <div className="mt-6 text-center">
          <a
            href="/"
            className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-md transition-colors"
          >
            トップに戻る
          </a>
        </div>
      </div>
    </div>
  );
}
