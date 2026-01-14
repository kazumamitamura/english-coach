import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai"; // 直接Geminiを呼び出す
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
  // LINE IDがない場合はスキップ
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
async function saveToSpreadsheet(data: any, advice: string) {
  try {
    const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const sheetId = process.env.GOOGLE_SPREADSHEET_ID; // 変数名を合わせました

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
    
    await sheet.addRow({
      "日時": new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
      "氏名": data.name || "名無し", // 名前がない場合のフォールバック
      "学年・志望校": data.target || data.grade, // フロントエンドの変数名揺れに対応
      "生徒の説明": data.explanation || data.message,
      "AI添削": advice
    });
  } catch (e) { 
    console.error("Spreadsheet Error:", e); 
    // エラーが出ても処理を止めない
  }
}

// -----------------------------------------
// 2. メイン処理 (POST API)
// -----------------------------------------

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // フロントエンドからのデータ受け取り（変数名の揺れを吸収）
    const name = body.name || "生徒";
    const target = body.target || body.targetSchool || "未設定";
    const explanation = body.explanation || body.message || "";
    const lineUserId = body.lineUserId;
    const userEmail = body.email;

    // --- A. AI分析 (Gemini) ---
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not defined");

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // 2.5が使えない場合は1.5-flash推奨
    
    // プロンプト（AIへの指示：先生のこだわり部分）
    const prompt = `
    あなたは大学入試英語のスペシャリストであり、予備校のカリスマ講師です。
    以下の生徒が書いた「仮定法の説明」を採点し、厳しくも愛のある指導を行ってください。

    ## 生徒情報
    - 氏名: ${name}
    - 志望校・学年: ${target}

    ## 生徒による「仮定法」の説明
    "${explanation}"

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

    // --- B. データベース保存 ---
    // データを整形して保存関数へ
    const saveObj = { name, target, explanation };
    await saveToSpreadsheet(saveObj, analysisText);

    // --- C. LINE送信 ---
    if (lineUserId) {
        const lineMsg = `
🎓 ${name}さん、添削完了！

📝 採点結果速報
${analysisText.slice(0, 80)}...

▼ 詳しい解説はメール送りました！必ず確認してください。
（AI予備校講師より）
`;
        await sendLineMessage(lineUserId, lineMsg);
    }

    // --- D. メール送信 (HTML) ---
    // ここで sender設定
    const smtpUser = process.env.SMTP_USER || process.env.SENDER_EMAIL;
    const smtpPass = process.env.SMTP_PASSWORD || process.env.SENDER_PASSWORD;

    if (smtpUser && smtpPass && userEmail) {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || "smtp.gmail.com",
          port: 587,
          secure: false,
          auth: { user: smtpUser, pass: smtpPass },
        });

        // MarkdownをHTMLに変換
        const parsedHtml = await marked.parse(analysisText);

        // メール用のHTMLテンプレート
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
                <p>提出ありがとうございます。AIプロ講師による添削結果をお届けします。</p>
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

    return NextResponse.json({ success: true, analysis: analysisText });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Server Error", details: error.message }, { status: 500 });
  }
}