import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// הגדרת מאגר המפתחות והמודלים לשימוש ברוטציה/גיבוי
const API_KEYS = [
  process.env.GOOGLE_API_KEY,
  process.env.GOOGLE_API_KEY_SECONDARY
].filter(Boolean) as string[];

// רשימת המודלים לפי סדר עדיפות: החדש ביותר קודם
const MODELS = [
  "gemini-2.5-flash-preview-09-2025", // עדיפות ראשונה (דמוי גרסה 3)
  "gemini-1.5-flash",                 // גיבוי מהיר ויציב
  "gemini-pro"                        // גיבוי אחרון
];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { playerName, playerGender, heatLevel, type, previousChallenges } = body;

    // המרת רשימת המשימות הקודמות לטקסט עבור הפרומפט
    const historyText = previousChallenges && previousChallenges.length > 0 
        ? `History of tasks already given to this player (DO NOT REPEAT THESE): ${previousChallenges.join(", ")}.`
        : "No previous tasks.";

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
      6. שמור על הטקסט קצר וקולע (מקסימום 2 משפטים).
      7. וודא שלא חוזרים על משימות מההיסטוריה שצירפתי.
      8. תן דירוג "חריפות" (spiciness) מ-1 עד 10 לאתגר הספציפי שיצרת.

      המבנה של ה-JSON חייב להיות כזה (ללא Markdown מסביב):
      {
        "content": "הטקסט של המשימה בעברית",
        "spiciness": מספר (1-10),
        "themeColor": "קוד צבע HEX שמתאים לאווירה"
      }
    `;

    // --- לוגיקת ה-FALLBACK החכמה ---
    let lastError = null;

    // לולאה חיצונית: מעבר על מפתחות API
    for (const apiKey of API_KEYS) {
        const genAI = new GoogleGenerativeAI(apiKey);

        // לולאה פנימית: מעבר על מודלים עבור כל מפתח
        for (const modelName of MODELS) {
            try {
                // ניסיון יצירה
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const responseText = response.text();

                // אם הגענו לכאן - יש הצלחה! נעבד ונחזיר תשובה.
                const cleanedText = responseText.replace(/```json|```/g, "").trim();
                const data = JSON.parse(cleanedText);
                
                // הוספת מידע על המודל שהצליח (עבור התצוגה)
                data.usedModel = `${modelName} (Key ${apiKey.substr(0, 4)}...)`;
                
                return NextResponse.json(data);

            } catch (error: any) {
                console.warn(`Failed with Key: ...${apiKey.slice(-4)} and Model: ${modelName}. Error: ${error.message}`);
                lastError = error;
                // ממשיכים לאיטרציה הבאה בלולאה (מודל הבא או מפתח הבא)
                continue;
            }
        }
    }

    // אם סיימנו את כל המפתחות וכל המודלים ועדיין נכשלנו:
    console.error("All API attempts failed.");
    return NextResponse.json({
        content: "המערכת עמוסה כרגע... תעשה שוט בינתיים!",
        spiciness: 10,
        themeColor: "#FF0000",
        usedModel: "Fallback (Error)"
    });

  } catch (error) {
    console.error("Critical API Error:", error);
    return NextResponse.json(
      { content: "שגיאה קריטית במערכת", spiciness: 10, themeColor: "#FF0000" },
      { status: 500 }
    );
  }
}