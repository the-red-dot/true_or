import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

// הגדרת מאגר המפתחות לשימוש ברוטציה (ראשי וגיבוי)
const API_KEYS = [
  process.env.GOOGLE_API_KEY,
  process.env.GOOGLE_API_KEY_SECONDARY
].filter(Boolean) as string[];

// רשימת המודלים לפי סדר עדיפות ומכסות
const MODELS = [
  "gemini-2.5-flash",          // מודל יציב ומהיר (מומלץ כראשי)
  "gemini-3-flash-preview",    // המודל החדש ביותר
  "gemini-2.0-flash",          // מודל מאוזן
  "gemini-2.5-flash-lite"      // מודל קליל לגיבוי חירום
];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { playerName, playerGender, heatLevel, type, previousChallenges } = body;

    // המרת רשימת המשימות הקודמות לטקסט עבור הפרומפט
    const historyText = previousChallenges && previousChallenges.length > 0 
        ? `היסטוריה של משימות שכבר ניתנו לשחקן (חשוב מאוד! אין לחזור עליהן או על דומות להן): ${previousChallenges.join(", ")}.`
        : "אין משימות קודמות.";

    // בניית הפרומפט המשודרג עם סקאלה מדויקת
    const prompt = `
      אתה המנחה של משחק "אמת או חובה" מסיבתי, אנרגטי ומסוגנן.
      השחקן הנוכחי: ${playerName} (מין: ${playerGender}).
      מצב משחק: ${type} (אמת או חובה).
      רמת חום נוכחית (1-10): ${heatLevel}.
      ${historyText}

      עליך לייצר משימת ${type} אחת בלבד, ספציפית ומדויקת לרמת החום שנבחרה (${heatLevel}).
      
      הנחיות מפורטות לרמת האינטנסיביות (הקפד על הדרגתיות!):
      
      רמות נמוכות (תמים ומשעשע):
      - רמה 1: תמים לחלוטין וילדותי. דוגמאות: "עשה פרצוף מצחיק", "ספר בדיחת קרש", "נסה ללקק את המרפק".
      - רמה 2: קליל וחברתי. דוגמאות: "תעשה ריקוד ניצחון מוגזם", "שיר שיר ילדים בקול רם", "דבר במבטא מצחיק עד הסיבוב הבא".
      - רמה 3: מביך בקטנה או פיזי עדין. דוגמאות: "תעשה ריקוד סלואו דרמטי עם מטאטא או כרית", "נשק את גב היד של השחקן מימינך בג'נטלמניות", "תעשה הליכת דוגמנות".

      רמות בינוניות (פלרטטני ונועז):
      - רמה 4: פלרטטני עדין. דוגמאות: "תחמיא למישהו בחדר על תכונה פיזית", "תן נשיקה בלחי לשחקן משמאלך", "שב על הברכיים של מישהו למשך סיבוב אחד".
      - רמה 5: פלרטטני מורגש ומגע. דוגמאות: "תעשה מסאז' קצר בכתפיים למישהו", "לחש למישהו משהו סודי באוזן בצורה מפתה", "העבר קוביה קרח על היד של מישהו".
      - רמה 6: נועז ורומנטי. דוגמאות: "נשק מישהו בצוואר", "תחזיק ידיים עם מישהו למשך 2 דקות", "תקדיש שיר אהבה למישהו ותשיר לו אותו".
      - רמה 7: מתח מיני ברור. דוגמאות: "תן 'לאפ דאנס' קצר (לבוש מלא) למישהו", "נשק מישהו נשיקה קצרה בפה (בהסכמה)", "תעביר כרטיס אשראי מהפה שלך לפה של מישהו אחר".

      רמות גבוהות (לוהט ואקסטרים - למבוגרים בלבד 🔞):
      - רמה 8: לוהט מאוד. דוגמאות: "תוריד פריט לבוש אחד (לא הלבשה תחתונה)", "תן נשיקה באזור רגיש (בטן/צוואר/ירך)", "רקוד צמוד מאוד למישהו".
      - רמה 9: קינקי ונועז. דוגמאות: "תדגים תנוחה אהובה עם כרית", "תן למישהו לתת לך ספאנק קטן", "אכול פרי/מאכל בצורה הכי סקסית שאפשר", "תעשה קולות של עונג".
      - רמה 10: אקסטרים קינקי (אבל בר ביצוע במסיבה!). דוגמאות: "לקק קצפת/משקה מגוף של מישהו (צוואר/בטן)", "סימולציה של אקט (לבושים) למשך 10 שניות", "תן למישהו לקשור לך את הידיים לסיבוב הבא".

      כללי ברזל:
      1. התשובה חייבת להיות ב**עברית בלבד** (סלנג ישראלי זה מעולה, דבר בגובה העיניים).
      2. המשימה חייבת להיות **ברת ביצוע** כאן ועכשיו בסלון (אל תבקש לצאת מהבית או אביזרים נדירים).
      3. שמור על הטקסט קצר וקולע (מקסימום 2 משפטים) כדי שייכנס יפה בעיצוב.
      4. **הימנע מחזרות**: בדוק את ההיסטוריה. אם ביקשת להוריד חולצה והוא כבר בלי חולצה - אל תבקש שוב.
      5. תן דירוג "חריפות" (spiciness) מ-1 עד 10 שתואם למשימה שיצרת בפועל.

      המבנה של ה-JSON חייב להיות כזה (ללא Markdown מסביב):
      {
        "content": "הטקסט של המשימה בעברית",
        "spiciness": מספר (1-10),
        "themeColor": "קוד צבע HEX שמתאים לאווירה (למשל ורוד בייבי לקליל, אדום עז לנועז, בורדו/שחור לקינקי)"
      }
    `;

    // --- לוגיקת ה-FALLBACK החכמה ---
    let lastError = null;

    // לולאה חיצונית: מעבר על מפתחות API (Key 1 -> Key 2)
    for (const apiKey of API_KEYS) {
        const genAI = new GoogleGenerativeAI(apiKey);

        // לולאה פנימית: מעבר על המודלים לפי הסדר
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
                
                // הוספת מידע על המודל שהצליח (עבור התצוגה במסך)
                data.usedModel = `${modelName}`;
                
                return NextResponse.json(data);

            } catch (error: any) {
                console.warn(`Failed with Key ending in ...${apiKey.slice(-4)} and Model: ${modelName}. Error: ${error.message}`);
                lastError = error;
                // ממשיכים לאיטרציה הבאה בלולאה (מודל הבא או מפתח הבא)
                continue;
            }
        }
    }

    // אם סיימנו את כל המפתחות וכל המודלים ועדיין נכשלנו:
    console.error("All API attempts failed. Last Error:", lastError);
    return NextResponse.json({
        content: "המערכת עמוסה כרגע... תעשה שוט בינתיים! (אנא נסה שוב)",
        spiciness: 10,
        themeColor: "#FF0000",
        usedModel: "System Failure"
    });

  } catch (error) {
    console.error("Critical API Error:", error);
    return NextResponse.json(
      { content: "שגיאה קריטית במערכת", spiciness: 10, themeColor: "#FF0000" },
      { status: 500 }
    );
  }
}