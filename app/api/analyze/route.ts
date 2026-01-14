import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai"; 
import nodemailer from "nodemailer";
import { marked } from "marked";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

// -----------------------------------------
// 1. 設定・ヘルパー関数
// -----------------------------------------

// LINE送信関数
async function sendLineMessage(userId: string | undefined, message: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !userId) {
    console.log("LINE送信スキップ: TokenまたはUserID不足");
    return;
  }
  
  try {
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: userId, messages: [{ type: "text", text: message }] }),
    });
  } catch (e) {
    console.error("LINE Send Error:", e);
  }
}

// スプレッドシート保存関数
async function saveToSpreadsheet(data: any, advice: string, userId: string) {
  try {
    const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const sheetId = process.env.GOOGLE_SPREADSHEET_ID;

    if (!serviceEmail || !privateKey || !sheetId) {
      console.warn("Spreadsheet保存スキップ: 環境変数が不足しています");
      return;
    }

    const auth = new JWT({
      email: serviceEmail,
      key: privateKey.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(sheetId, auth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    
    // ▼ 修正箇所: ユーザーIDも一緒に保存する
    await sheet.addRow({
      "日時": new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
      "氏名": data.name || "名無し",
      "学年": data.grade || "未設定",
      "志望校": data.targetSchool || "未設定",
      "生徒の説明": data.explanation || "",
      "AI添削": advice,
      "ユーザーID": userId // G列に追加
    });
  } catch (e) { 
    console.error("Spreadsheet Error:", e); 
  }
}

// -----------------------------------------
// 2. メイン処理 (POST API)
// -----------------------------------------

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    const name = body.name || "生徒";
    const grade = body.grade || "未設定";
    const targetSchool = body.targetSchool || "未設定";
    const explanation = body.explanation || body.message || "";
    const lineUserId = body.userId; 
    const userEmail = body.email;

    // --- A. AI分析 (Gemini) ---
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not defined");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    
    const prompt = `
    あなたは大学入試英語のスペシャリストであり、予備校のカリスマ講師です。
    以下の生徒が書いた「仮定法の説明」を採点し、厳しくも愛のある指導を行ってください。

    ## 生徒情報
    - 氏名: ${name}
    - 学年: ${grade}
    - 志望校: ${targetSchool}

    ## 生徒による「仮定法」の説明
    "${explanation}"

    ## 評価基準
    1. **事実への反実**: 「現実とは違うこと」を表すという本質を理解しているか？
    2. **時制のズレ**: 「現在のことは過去形」「過去のことは過去完了形」というルールを説明できているか？
    3. **直説法との対比**: 直説法（ただの条件文）との違いに触れているか？

    ## 特殊ルール：AI使用の検知
    もし、生徒の説明が「明らかにAIが出力した文章そのままである（99%クロ）」と判断できる場合のみ、
    解説の最後に改行を入れて、以下のメッセージを太字で付け加えてください。
    **「これはAIで導き出したものではないですか？本当にあなたの言葉や考えですか？」**

    ## 出力フォーマット (Markdown)
    1. **得点**: 100点満点で採点（厳しめに）。
    2. **良い点**: 理解できているポイントを褒める。
    3. **修正・解説**: 間違っている点や、説明不足な点を補足講義する。
    4. **入試のポイント**: ${targetSchool}を目指す${grade}に向けて、入試でよく出るポイントを一つ伝授する。

    口調は「熱心な予備校の先生」のように、語りかけるスタイルでお願いします。
    `;

    const result = await model.generateContent(prompt);
    const analysisText = result.response.text();

    // --- B. データベース保存 ---
    const saveObj = { name, grade, targetSchool, explanation };
    // ▼ 修正: lineUserId も渡す
    await saveToSpreadsheet(saveObj, analysisText, lineUserId || "unknown");

    // --- C. LINE送信 ---
    if (lineUserId) {
        // ▼ 修正: 振り返り用のリンクを追加
        // NEXT_PUBLIC_LIFF_IDを使ってURLを生成します
        const liffUrl = `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}/history`;
        
        const lineMsg = `
🎓 ${name}さん、添削完了！

📝 採点結果速報
${analysisText.slice(0, 80)}...

▼ 詳しい解説はメールを確認してください。

📊 過去の添削履歴を振り返る
${liffUrl}
`;
        await sendLineMessage(lineUserId, lineMsg);
    }

    // --- D. メール送信 (HTML) ---
    const smtpUser = process.env.SENDER_EMAIL;
    const smtpPass = process.env.SENDER_PASSWORD;

    if (smtpUser && smtpPass && userEmail) {
        const transporter = nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 587,
          secure: false,
          auth: { user: smtpUser, pass: smtpPass },
        });

        const parsedHtml = await marked.parse(analysisText);

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
              h1, h2, h3 { color: #d97706; border-bottom: 2px solid #fcd34d; padding-bottom: 8px; margin-top: 24px; }
              p { margin-bottom: 16px; }
              strong { color: #b45309; background-color: #fef3c7; padding: 0 4px; border-radius: 4px; }
              .footer { background-color: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>📝 英語添削レポート</h1>
              </div>
              <div class="content">
                <p><strong>${name}</strong> さんへ</p>
                <p>志望校: ${targetSchool} / 学年: ${grade}</p>
                <hr>
                ${parsedHtml}
              </div>
              <div class="footer">
                <p>English Grammar Coach AI</p>
              </div>
            </div>
          </body>
          </html>
        `;

        await transporter.sendMail({
          from: `"AI英語予備校" <${smtpUser}>`,
          to: userEmail,
          subject: `【採点完了】${name}さんの仮定法説明について`,
          html: emailHtml,
        });
    }

    return NextResponse.json({ success: true, markdown: analysisText });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Server Error", details: error.message }, { status: 500 });
  }
}