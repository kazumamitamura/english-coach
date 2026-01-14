import { GoogleGenerativeAI } from "@google/generative-ai";

// モデル名を指定しない場合は、自動的に "gemini-2.5-flash" が使われます
export const getGeminiModel = (modelName: string = "gemini-2.5-flash") => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in environment variables");
  }
  
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({ model: modelName });
};