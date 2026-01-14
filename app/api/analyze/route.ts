import { NextRequest, NextResponse } from "next/server";
import { getGeminiModel } from "@/lib/gemini";
import nodemailer from "nodemailer";
import { marked } from "marked";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

// LINE送信関数
async function sendLineMessage(userId: string | undefined, message: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !userId) return;
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: userId, messages: [{ type: "text", text: message }] }),
  });
}

// スプレッドシート保存関数
async function saveToSpreadsheet(data: any, advice: string) {
  try {
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SPREADSHEET_ID!, auth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    await sheet.addRow({
      "日時": new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
      "氏名": data.name,
      "志望校": data.target,
      "生徒の説明": data.explanation,
      "AI添削": advice
    });
  } catch (e) { console.error("Spreadsheet Error:", e); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. AI分析 (Gemini 2.5 Flash)
    const model = getGeminiModel("gemini-2.5-flash");
    
    // プロンプト（AIへの指示）
    const prompt = `
あなたは大学入試英語のスペシャリストであり、予備校のカリスマ講師です。
以下の生徒が書いた「仮定法の説明」を採点し、厳しくも愛のある指導を行ってください。

## 生徒情報
- 氏名: ${body.name}
- 志望校・学年: ${body.target}

## 生徒による「仮定法」の説明
"${body.explanation}"

## 評価基準
1. **事実への反実**: 「現実とは違うこと」を表すという本質を理解しているか？
2. **時制のズレ**: 「現在のことは過去形」「過去のことは過去完了形」というルールを説明できているか？
3. **直説法との対比**: 直説法（ただの条件文）との違いに触れているか？

## 特殊ルール：AI使用の検知
もし、生徒の説明が「明らかにAI（ChatGPTやGeminiなど）が出力した文章そのままである（99%クロ）」と判断できる場合のみ、
解説の最後に改行を入れて、以下のメッセージを太字で付け加えてください。
**「これはAIで導き出したものではないですか？本当にあなたの言葉や考えですか？」**
※ 生徒が自分で一生懸命書いた拙い文章の場合は、絶対にこのメッセージを付けないでください。

## 出力フォーマット (Markdown)
1. **得点**: 100点満点で採点（厳しめに）。
2. **良い点**: 理解できているポイントを褒める。
3. **修正・解説**: 間違っている点や、説明不足な点を補足講義する。
4. **入試のポイント**: 入試でよく出るポイントを一つ伝授する。

口調は「熱心な予備校の先生」のように、語りかけるスタイルでお願いします。
`;

    const result = await model.generateContent(prompt);
    const analysisText = result.response.text();

    // 2. データベース保存
    await saveToSpreadsheet(body, analysisText);

    // 3. LINE送信
    const lineMsg = `
🎓 ${body.name}さん、添削完了！

📝 採点結果速報
${analysisText.slice(0, 80)}...

▼ 詳しい解説はメール送りました！必ず確認してください。
（AI予備校講師より）
`;
    await sendLineMessage(body.lineUserId, lineMsg);

    // 4. メール送信（ここを美しくしました！）
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.SENDER_EMAIL, pass: process.env.SENDER_PASSWORD },
    });

    // MarkdownをHTMLに変換
    const parsedHtml = await marked.parse(analysisText);

    // メール用のHTMLテンプレート（スタイル適用）
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f3f4f6; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background-color: #d97706; color: white; padding: 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; }
          .content { padding: 30px; }
          
          /* AI出力テキストの装飾 */
          h1, h2, h3 { color: #d97706; border-bottom: 2px solid #fcd34d; padding-bottom: 8px; margin-top: 24px; }
          p { margin-bottom: 16px; }
          strong { color: #b45309; background-color: #fef3c7; padding: 0 4px; border-radius: 4px; }
          ul, ol { padding-left: 20px; margin-bottom: 16px; }
          li { margin-bottom: 8px; }
          hr { border: 0; height: 1px; background: #e5e7eb; margin: 30px 0; }
          
          .footer { background-color: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📝 英語添削レポート</h1>
          </div>
          <div class="content">
            <p><strong>${body.name}</strong> さんへ</p>
            <p>提出ありがとうございます。AIプロ講師による添削結果をお届けします。</p>
            <hr>
            ${parsedHtml}
          </div>
          <div class="footer">
            <p>English Grammar Coach AI<br>Powered by Gemini 2.5</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await transporter.sendMail({
      from: `"AI英語予備校" <${process.env.SENDER_EMAIL}>`,
      to: body.email,
      subject: `【採点完了】${body.name}さんの仮定法説明について`,
      html: emailHtml,
    });

    return NextResponse.json({ success: true, analysis: analysisText });

  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}