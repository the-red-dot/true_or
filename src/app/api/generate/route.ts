// truth-or-dare-ai\src\app\api\generate\route.ts

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// אתחול המודל
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { playerName, playerGender, heatLevel, type } = body;

    // UPDATE: שימוש בגרסת Gemini 2.5 Flash Preview כפי שביקשת
    // הערה: וודא שה-API Key שלך תומך בגרסה הזו. אם לא, נסה: gemini-1.5-flash
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-09-2025" });

    // בניית הפרומפט המותאם
    const prompt = `
      You are the host of a high-energy, sexy, and stylish Truth or Dare party game.
      Current Player: ${playerName} (Gender: ${playerGender}).
      Game Mode: ${type} (Truth or Dare).
      Heat Level (1-10): ${heatLevel}.

      Instructions:
      1. Generate a creative, engaging, and specifically tailored ${type} challenge for this player.
      2. If Heat Level is low (1-3), make it funny and light.
      3. If Heat Level is medium (4-7), make it flirty and daring.
      4. If Heat Level is high (8-10), make it extremely spicy, kinky, and for adults only.
      5. Also provide a "spiciness" rating for this specific generated question from 1 to 10.
      6. Output MUST be valid JSON only, no markdown.

      JSON Structure:
      {
        "content": "The challenge text in Hebrew (עברית)",
        "spiciness": number (1-10),
        "themeColor": "hex color code matching the mood"
      }
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();
    
    // ניקוי המרקדאון אם קיים כדי לקבל JSON נקי
    const cleanedText = responseText.replace(/```json|```/g, "").trim();
    
    try {
        const data = JSON.parse(cleanedText);
        return NextResponse.json(data);
    } catch (parseError) {
        console.error("JSON Parse Error:", parseError);
        // Fallback if JSON fails
        return NextResponse.json({
            content: cleanedText,
            spiciness: 5,
            themeColor: "#FF00FF"
        });
    }

  } catch (error) {
    console.error("Gemini API Error:", error);
    return NextResponse.json(
      { content: "תעשה שוט! ה-AI שתה יותר מדי...", spiciness: 10, themeColor: "#FF0000" },
      { status: 500 }
    );
  }
}