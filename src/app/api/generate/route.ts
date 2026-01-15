import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// אתחול לקוח Supabase בצד השרת
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { playerName, playerGender, heatLevel, type, previousChallenges } = body;

    // נרמול מגדר (התאמה למבנה בדאטה בייס)
    let dbGender = 'neutral';
    if (playerGender === 'male') dbGender = 'male';
    if (playerGender === 'female') dbGender = 'female';

    // טווח רמות: גמישות של +/- 1 כדי למצוא יותר תוצאות
    let minHeat = heatLevel === 1 ? 1 : heatLevel - 1;
    let maxHeat = heatLevel === 10 ? 10 : heatLevel + 1;

    // שליפת משימות רלוונטיות מה-DB
    const { data: tasks, error } = await supabase
      .from('game_tasks')
      .select('*')
      .eq('type', type) // 'אמת' או 'חובה'
      .gte('heat_level', minHeat)
      .lte('heat_level', maxHeat)
      .or(`gender.eq.${dbGender},gender.eq.neutral`);

    if (error) {
      console.error("Supabase Error:", error);
      return NextResponse.json({
          content: `משימת גיבוי (${type}): ספר פדיחה שקרתה לך לאחרונה!`,
          spiciness: heatLevel,
          themeColor: "#FF00FF",
          usedModel: "Backup (DB Error)"
      });
    }

    if (!tasks || tasks.length === 0) {
        return NextResponse.json({
            content: `לא מצאתי משימה לרמה ${heatLevel}... אז כולם עושים שוט לחיים! 🥂`,
            spiciness: heatLevel,
            themeColor: "#FF0000",
            usedModel: "Database (Empty)"
        });
    }

    // סינון משימות שכבר היו (לפי הטקסט שנשלח מהקלאיינט)
    const availableTasks = tasks.filter((t: any) => 
        !previousChallenges.some((prev: string) => prev === t.content)
    );

    // אם סיימנו את כל המשימות, נאפס ונבחר מכל המאגר
    const finalPool = availableTasks.length > 0 ? availableTasks : tasks;

    // בחירה רנדומלית
    const randomTask = finalPool[Math.floor(Math.random() * finalPool.length)];

    return NextResponse.json({
      content: randomTask.content,
      spiciness: randomTask.heat_level,
      themeColor: randomTask.theme_color || '#ec4899',
      usedModel: "Supabase DB"
    });

  } catch (error) {
    console.error("Critical API Error:", error);
    return NextResponse.json(
      { 
          content: "תקלה בתקשורת... תעשה שוט!", 
          spiciness: 1, 
          themeColor: "#FF0000",
          usedModel: "Error"
      },
      { status: 500 }
    );
  }
}