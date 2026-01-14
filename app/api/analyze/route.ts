import { NextRequest, NextResponse } from 'next/server';
import { getGeminiModel } from '@/lib/gemini';
import { v4 as uuidv4 } from 'uuid';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import nodemailer from 'nodemailer';

// Google Sheets設定
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || '';
const SHEET_NAME = 'Responses';
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n') || '';

// LINE設定
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const LINE_USER_ID_PLACEHOLDER = '{USER_ID}'; // 実際のユーザーIDに置換

// メール設定
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || '';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://english-coach.vercel.app';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, school, explanation, userId } = body;

    if (!name || !email || !school || !explanation) {
      return NextResponse.json(
        { error: 'すべての項目を入力してください' },
        { status: 400 }
      );
    }

    // Geminiで分析
    const model = getGeminiModel();
    const prompt = `あなたは大学入試英語のスペシャリスト兼カリスマ予備校講師です。
以下の生徒の「仮定法の説明」を読み、採点・添削してください。

【評価基準】
- 「反実仮想（事実と異なる）」の理解
- 「時制のズレ（現在のことは過去形）」の理解

【出力形式】
Markdown形式で以下の内容を出力してください：
1. 採点（100点満点）
2. 良い点
3. 修正すべき点
4. 入試のワンポイントアドバイス

【生徒の説明】
${explanation}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const markdown = response.text();

    // ID生成
    const id = uuidv4();

    // Google Sheetsに保存
    try {
      const auth = new JWT({
        email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: GOOGLE_PRIVATE_KEY,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const doc = new GoogleSpreadsheet(SPREADSHEET_ID, auth);
      await doc.loadInfo();

      let sheet = doc.sheetsByTitle[SHEET_NAME];
      if (!sheet) {
        sheet = await doc.addSheet({ title: SHEET_NAME, headerValues: ['ID', '日時', '氏名', 'Email', '志望校', '生徒の説明', 'AIアドバイス'] });
      } else {
        // 既存のシートのヘッダーを確認
        try {
          await sheet.loadHeaderRow();
          if (!sheet.headerValues.includes('ID')) {
            await sheet.setHeaderRow(['ID', '日時', '氏名', 'Email', '志望校', '生徒の説明', 'AIアドバイス']);
          }
        } catch {
          // ヘッダーが存在しない場合は設定
          await sheet.setHeaderRow(['ID', '日時', '氏名', 'Email', '志望校', '生徒の説明', 'AIアドバイス']);
        }
      }

      await sheet.addRow({
        ID: id,
        日時: new Date().toISOString(),
        氏名: name,
        Email: email,
        志望校: school,
        生徒の説明: explanation,
        AIアドバイス: markdown,
      });
    } catch (sheetError) {
      console.error('Google Sheets error:', sheetError);
      // Sheetsへの保存に失敗しても処理は続行
    }

    const resultUrl = `${BASE_URL}/result/${id}`;

    // 評価の要約を生成（LINE用）
    const scoreMatch = markdown.match(/(\d+)\s*点/i) || markdown.match(/採点[^\n]*(\d+)/i);
    const score = scoreMatch ? `${scoreMatch[1]}点` : '評価済み';

    // LINE送信
    if (userId && LINE_CHANNEL_ACCESS_TOKEN) {
      try {
        await fetch('https://api.line.me/v2/bot/message/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({
            to: userId,
            messages: [
              {
                type: 'text',
                text: `採点が完了しました！\n\n${score}\n\n詳細はこちらからご確認ください：\n${resultUrl}`,
              },
            ],
          }),
        });
      } catch (lineError) {
        console.error('LINE send error:', lineError);
        // LINE送信に失敗しても処理は続行
      }
    }

    // メール送信
    if (SMTP_USER && SMTP_PASSWORD) {
      try {
        const transporter = nodemailer.createTransport({
          host: SMTP_HOST,
          port: SMTP_PORT,
          secure: SMTP_PORT === 465,
          auth: {
            user: SMTP_USER,
            pass: SMTP_PASSWORD,
          },
        });

        await transporter.sendMail({
          from: SMTP_USER,
          to: email,
          subject: '英語仮定法 理解度チェック 結果',
          html: `
            <h2>英語仮定法 理解度チェック 結果</h2>
            <p>${name} 様</p>
            <p>採点が完了しました。以下の内容をご確認ください。</p>
            <hr>
            <div style="white-space: pre-wrap;">${markdown.replace(/\n/g, '<br>')}</div>
            <hr>
            <p>詳細はこちら：<a href="${resultUrl}">${resultUrl}</a></p>
          `,
          text: `
英語仮定法 理解度チェック 結果

${name} 様

採点が完了しました。以下の内容をご確認ください。

${markdown}

詳細はこちら：${resultUrl}
          `,
        });
      } catch (mailError) {
        console.error('Email send error:', mailError);
        // メール送信に失敗しても処理は続行
      }
    }

    return NextResponse.json({
      success: true,
      markdown,
      id,
      url: resultUrl,
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '分析中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
