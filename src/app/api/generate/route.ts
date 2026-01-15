// src\app\api\generate\route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// אתחול לקוח Supabase בצד השרת
// הערה: וודא שיש לך את המשתנים האלו ב-.env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!; // או SERVICE_ROLE אם צריך הרשאות מיוחדות
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { playerName, playerGender, heatLevel, type, previousChallenges } = body;

    // נרמול מגדר (למקרה שהתקבל 'other' או משהו אחר, נלך על ניטרלי או ננסה להתאים)
    // בדאטה בייס שלנו יש: 'male', 'female', 'neutral'
    let dbGender = 'neutral';
    if (playerGender === 'male') dbGender = 'male';
    if (playerGender === 'female') dbGender = 'female';
    // אם זה 'other', נשאיר 'neutral' או נשלוף משימות ניטרליות

    // טווח רמות: כדי לא להגביל רק לרמה 5 בדיוק, נאפשר טווח של +/- 1
    // אלא אם זה רמה 1 או 10
    let minHeat = heatLevel === 1 ? 1 : heatLevel - 1;
    let maxHeat = heatLevel === 10 ? 10 : heatLevel + 1;
    // אם רוצים דיוק מוחלט, אפשר לעשות minHeat = heatLevel ו-maxHeat = heatLevel

    // שליפת משימות רלוונטיות מה-DB
    // נשלוף משימות שמתאימות למין השחקן (או ניטרליות) ולרמת החום
    const { data: tasks, error } = await supabase
      .from('game_tasks')
      .select('*')
      .eq('type', type) // 'אמת' או 'חובה'
      .gte('heat_level', minHeat)
      .lte('heat_level', maxHeat)
      .or(`gender.eq.${dbGender},gender.eq.neutral`); // או המין הספציפי או ניטרלי

    if (error) {
      console.error("Supabase Error:", error);
      throw new Error("Failed to fetch tasks");
    }

    if (!tasks || tasks.length === 0) {
        // Fallback למקרה שאין משימות מתאימות בדיוק (נדיר אם ממלאים את ה-DB טוב)
        return NextResponse.json({
            content: `המערכת לא מצאה משימה לרמה ${heatLevel}... אז פשוט תעשו שוט לחיים! 🥂`,
            spiciness: heatLevel,
            themeColor: "#FF0000",
            usedModel: "Database (Fallback)"
        });
    }

    // סינון משימות שכבר היו (לפי הטקסט שנשלח מהקלאיינט)
    // previousChallenges הוא מערך של מחרוזות
    const availableTasks = tasks.filter(t => 
        !previousChallenges.some((prev: string) => prev === t.content)
    );

    // אם סיימנו את כל המשימות האפשריות, נאפס ונבחר מכל המאגר
    const finalPool = availableTasks.length > 0 ? availableTasks : tasks;

    // בחירה רנדומלית מתוך המאגר המסונן
    const randomTask = finalPool[Math.floor(Math.random() * finalPool.length)];

    // החלפת שמות (אופציונלי - אם רוצים להכניס את שם השחקן לתוך הטקסט)
    // כרגע הדאטה בייס כתוב בפנייה ישירה ("אתה"), אז זה פחות קריטי, אבל אפשר להוסיף.

    return NextResponse.json({
      content: randomTask.content,
      spiciness: randomTask.heat_level,
      themeColor: randomTask.theme_color,
      usedModel: "Supabase DB" // אינדיקציה ל-UI שהמידע הגיע מה-DB
    });

  } catch (error) {
    console.error("Critical API Error:", error);
    return NextResponse.json(
      { 
          content: "שגיאה בתקשורת עם מאגר המשימות. מישהו פה שתה יותר מדי...", 
          spiciness: 1, 
          themeColor: "#FF0000",
          usedModel: "Error"
      },
      { status: 500 }
    );
  }
}