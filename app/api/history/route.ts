import { NextResponse } from "next/server";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: "UserID is required" }, { status: 400 });
    }

    const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const sheetId = process.env.GOOGLE_SPREADSHEET_ID;

    if (!serviceEmail || !privateKey || !sheetId) {
      return NextResponse.json({ error: "Server config error" }, { status: 500 });
    }

    const auth = new JWT({
      email: serviceEmail,
      key: privateKey.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(sheetId, auth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    
    const rows = await sheet.getRows();
    
    // ユーザーIDが一致するものだけ抽出
    const historyData = rows
      .filter((row) => row.get("ユーザーID") === userId)
      .map((row) => ({
        date: row.get("日時"),
        explanation: row.get("生徒の説明"),
        advice: row.get("AI添削"),
      }))
      .reverse();

    return NextResponse.json({ history: historyData });

  } catch (error: any) {
    console.error("History API Error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}