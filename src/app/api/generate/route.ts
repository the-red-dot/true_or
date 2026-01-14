import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// אתחול המודל
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { playerName, playerGender, heatLevel, type, previousChallenges } = body;

    // פונקציה שמנסה לייצר תוכן עם מודל ראשי, ואם נכשלת עוברת למשני
    const generateWithFallback = async (prompt: string) => {
        const modelsToTry = ["gemini-2.5-flash-preview-09-2025", "gemini-1.5-flash"];
        
        for (const modelName of modelsToTry) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                const response = await result.response;
                return response.text();
            } catch (error) {
                console.warn(`Model ${modelName} failed, trying next...`);
                continue;
            }
        }
        throw new Error("All models failed");
    };

    // המרת רשימת המשימות הקודמות לטקסט עבור הפרומפט
    const historyText = previousChallenges && previousChallenges.length > 0 
        ? `History of tasks already given to this player (DO NOT REPEAT THESE): ${previousChallenges.join(", ")}.`
        : "No previous tasks.";

    // בניית הפרומפט המותאם
    const prompt = `
      אתה המנחה של משחק "אמת או חובה" מסיבתי, אנרגטי ומסוגנן.
      השחקן הנוכחי: ${playerName} (מין: ${playerGender}).
      מצב משחק: ${type} (אמת או חובה).
      רמת חום (1-10): ${heatLevel}.
      ${historyText}

      הוראות:
      1. צור משימת ${type} יצירתית, מותאמת אישית ומגניבה לשחקן הזה.
      2. אם רמת החום נמוכה (1-3): שיהיה מצחיק וקליל.
      3. אם רמת החום בינונית (4-7): שיהיה פלרטטני ונועז.
      4. אם רמת החום גבוהה (8-10): שיהיה חריף מאוד, קינקי ולמבוגרים בלבד.
      5. חשוב מאוד: התשובה חייבת להיות ב**עברית בלבד**.
      6. שמור על הטקסט קצר וקולע (מקסימום 2 משפטים) כדי שייכנס יפה בעיצוב. אל תחפור.
      7. בדוק את ההיסטוריה שצירפתי - אם כבר ביקשת ממנו משהו (למשל להוריד חולצה), אל תבקש שוב דברים דומים שכבר בוצעו.
      8. תן דירוג "חריפות" (spiciness) מ-1 עד 10 לאתגר הספציפי שיצרת.

      המבנה של ה-JSON חייב להיות כזה (ללא Markdown מסביב):
      {
        "content": "הטקסט של המשימה בעברית",
        "spiciness": מספר (1-10),
        "themeColor": "קוד צבע HEX שמתאים לאווירה"
      }
    `;

    const responseText = await generateWithFallback(prompt);
    
    // ניקוי המרקדאון אם קיים כדי לקבל JSON נקי
    const cleanedText = responseText.replace(/```json|```/g, "").trim();
    
    try {
        const data = JSON.parse(cleanedText);
        return NextResponse.json(data);
    } catch (parseError) {
        console.error("JSON Parse Error:", parseError);
        // Fallback if JSON fails
        return NextResponse.json({
            content: cleanedText, // במקרה חירום מציג את הטקסט הגולמי
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