import { GoogleGenerativeAI } from '@google/generative-ai';

export function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  
  const genAI = new GoogleGenerativeAI(apiKey);
  // Gemini 2.5 Flash (実際のAPIでは最新のフラッシュモデルを使用)
  return genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
}
