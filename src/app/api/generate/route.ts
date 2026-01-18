// src/app/api/generate/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// אתחול לקוח Supabase בצד השרת
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // הוספנו את players לרשימת הפרמטרים הנשלפים מהבקשה
    const { playerName, playerGender, heatLevel, type, previousChallenges, players } = body;

    // --- Safety Check: Max Heat Cap ---
    // מוצאים את השחקן הספציפי כדי לבדוק את הגבולות שלו
    let effectiveHeat = heatLevel;
    // אנו מניחים ש-players מועבר בבקשה (מה-Client)
    const activePlayer = players?.find((p: any) => p.name === playerName);
    
    if (activePlayer && typeof activePlayer.max_heat_level === 'number') {
        // אם רמת החום שנבחרה במשחק גבוהה מהמקסימום של השחקן, משנמכים אותה
        if (effectiveHeat > activePlayer.max_heat_level) {
            console.log(`Capping heat for ${playerName}: ${effectiveHeat} -> ${activePlayer.max_heat_level}`);
            effectiveHeat = activePlayer.max_heat_level;
        }
    }

    // נרמול מגדר (התאמה למבנה בדאטה בייס)
    let dbGender = 'neutral';
    if (playerGender === 'male') dbGender = 'male';
    if (playerGender === 'female') dbGender = 'female';

    // טווח רמות: גמישות של +/- 1 סביב ה-effectiveHeat (הרמה המותאמת אישית)
    let minHeat = effectiveHeat === 1 ? 1 : effectiveHeat - 1;
    let maxHeat = effectiveHeat === 10 ? 10 : effectiveHeat + 1;

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
          spiciness: effectiveHeat,
          themeColor: "#FF00FF",
          usedModel: "Backup (DB Error)"
      });
    }

    if (!tasks || tasks.length === 0) {
        return NextResponse.json({
            content: `לא מצאתי משימה לרמה ${effectiveHeat}... אז כולם עושים שוט לחיים! 🥂`,
            spiciness: effectiveHeat,
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
    
    let content = randomTask.content;

    // --- לוגיקת בחירת קורבן (Victim Logic) ---
    // רק אם המשימה מכילה את הפלייסהולדר [chosenName]
    if (content.includes("[chosenName]") && players && players.length > 0) {
        let victims: any[] = [];
        
        // סינון לפי מגדר הפוך: בן מקבל בת, בת מקבלת בן
        if (playerGender === 'male') {
            victims = players.filter((p: any) => p.gender === 'female');
        } else if (playerGender === 'female') {
            victims = players.filter((p: any) => p.gender === 'male');
        }

        // גיבוי 1: אם אין קורבנות מהמין השני (או אם המגדר נייטרלי/אחר), קח כל שחקן שהוא לא המבצע עצמו
        if (victims.length === 0) {
            victims = players.filter((p: any) => p.name !== playerName);
        }

        // בחירת הקורבן והחלפת השם בטקסט
        if (victims.length > 0) {
            const chosenVictim = victims[Math.floor(Math.random() * victims.length)];
            content = content.replace("[chosenName]", chosenVictim.name);
        } else {
            // גיבוי 2 (מקרה קיצון): משחק לבד או אין אף אחד אחר
            content = content.replace("[chosenName]", "עצמך (אין עוד שחקנים)");
        }
    }

    return NextResponse.json({
      content: content,
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