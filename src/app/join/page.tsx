// truth-or-dare-ai\src\app\join\page.tsx

"use client";

import React, { useState, useEffect, Suspense, useRef } from "react";
import { motion } from "framer-motion";
import {
  Camera,
  Loader2,
  AlertTriangle,
  Beer,
  XCircle,
  Flame,
  RefreshCw,
  LogOut,
} from "lucide-react";
import { supabase } from "@/app/lib/supabase";
import { useSearchParams } from "next/navigation";

// --- סוגי אירועים לשידור ---
type GameEvent = {
  type:
    | "emoji"
    | "action_skip"
    | "vote_like"
    | "vote_dislike"
    | "vote_shot"
    | "trigger_spin"
    | "update_heat"
    | "player_left";
  payload: any;
  playerId: string; // players.id
};

function getIsAnonymousUser(user: any): boolean {
  if (typeof user?.is_anonymous === "boolean") return user.is_anonymous;
  const provider = user?.app_metadata?.provider;
  return provider === "anonymous";
}

function prettyErr(e: any): string {
  const msg =
    e?.message ||
    e?.error_description ||
    e?.details ||
    (typeof e === "string" ? e : "") ||
    "Unknown error";
  return String(msg);
}

async function ensureAnonymousAuth(): Promise<{ userId: string; isAnonymous: boolean }> {
  const { data: s, error: sErr } = await supabase.auth.getSession();
  if (sErr) throw sErr;

  if (!s.session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    const u = data?.user;
    if (!u?.id) throw new Error("NO_USER_AFTER_ANON_LOGIN");
    return { userId: u.id, isAnonymous: getIsAnonymousUser(u) };
  }

  const { data: uRes, error: uErr } = await supabase.auth.getUser();
  if (uErr) throw uErr;
  if (!uRes?.user?.id) throw new Error("NO_USER");
  return { userId: uRes.user.id, isAnonymous: getIsAnonymousUser(uRes.user) };
}

function GameController() {
  const searchParams = useSearchParams();
  const hostId = searchParams.get("hostId");

  // Registration State
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other" | "">("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  // Game Logic State
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null); // players.id
  const [gameState, setGameState] = useState<any>(null);
  const [localHeat, setLocalHeat] = useState(1);

  // UX: show anonymous
  const [isAnonymous, setIsAnonymous] = useState(true);

  // refs for realtime callbacks
  const myPlayerIdRef = useRef<string | null>(null);
  const localHeatRef = useRef<number>(1);

  useEffect(() => {
    myPlayerIdRef.current = myPlayerId;
  }, [myPlayerId]);

  useEffect(() => {
    localHeatRef.current = localHeat;
  }, [localHeat]);

  // בדיקה אם השחקן כבר היה רשום (localStorage) — לא עושים auto-submit
  useEffect(() => {
    if (!hostId) return;
    const storedId = localStorage.getItem(`player_id_${hostId}`);
    if (storedId) {
      setMyPlayerId(storedId);
      // do NOT setIsSubmitted(true)
    }
  }, [hostId]);

  // Anonymous auth + Listen to game_states
  useEffect(() => {
    if (!hostId) return;

    let gameStateChannel: any = null;

    (async () => {
      try {
        const auth = await ensureAnonymousAuth();
        setIsAnonymous(auth.isAnonymous);

        // קריאה ראשונית (לא נכשל אם לא קיים)
        const { data: gs } = await supabase
          .from("game_states")
          .select("*")
          .eq("host_id", hostId)
          .maybeSingle();

        if (gs) {
          setGameState(gs);
          if (typeof gs.heat_level === "number") setLocalHeat(gs.heat_level);
        } else {
          setGameState(null); // עדיין אין חדר פתוח מצד המארח
        }

        // האזנה לשינויים בסטייט המשחק
        gameStateChannel = supabase
          .channel(`gamestate_listener_${hostId}`)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "game_states", filter: `host_id=eq.${hostId}` },
            (payload) => {
              const next = payload.new as any;
              setGameState(next);
              if (typeof next?.heat_level === "number" && next.heat_level !== localHeatRef.current) {
                setLocalHeat(next.heat_level);
              }
            }
          )
          .subscribe();
      } catch (e) {
        console.error("init join error:", e);
        // לא נחסום UI, רק נדע שיש תקלה
      }
    })();

    return () => {
      if (gameStateChannel) supabase.removeChannel(gameStateChannel);
    };
  }, [hostId]);

  const handleKicked = () => {
    if (hostId) localStorage.removeItem(`player_id_${hostId}`);
    setMyPlayerId(null);
    setIsSubmitted(false);
    // נשארים על מסך הרשמה/המתנה
  };

  const sendAction = async (type: GameEvent["type"], payload: any = {}) => {
    if (!hostId || !myPlayerId) return;
    await supabase.channel(`room_${hostId}`).send({
      type: "broadcast",
      event: "game_event",
      payload: { type, payload, playerId: myPlayerId },
    });
  };

  const handleHeatChange = (val: number) => {
    setLocalHeat(val);
    sendAction("update_heat", val);
  };

  const handleSpin = () => {
    sendAction("trigger_spin");
  };

  // Leave game: לא מוחקים DB (רק יוצאים מקומית + broadcast)
  const handleLeaveGame = async () => {
    if (!hostId) return;
    if (!confirm("האם אתה בטוח שברצונך לצאת מהמשחק?")) return;

    try {
      if (myPlayerId) {
        await sendAction("player_left");

        // אם יש לך is_active בעמודה – ננסה לסמן לא פעיל (אם אין, לא ניפול)
        const { error } = await supabase
          .from("players")
          .update({ is_active: false, updated_at: new Date().toISOString() } as any)
          .eq("id", myPlayerId);

        if (error) {
          // אם אין עמודות is_active/updated_at זה ייכשל – לא קריטי
          console.warn("players update (optional) failed:", error.message);
        }
      }
    } finally {
      handleKicked();
    }
  };

  // --- Registration Logic ---
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxWidth = 300;
          const scaleSize = maxWidth / img.width;
          canvas.width = maxWidth;
          canvas.height = img.height * scaleSize;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
      };
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setImagePreview(compressed);
      } catch {
        alert("שגיאה בתמונה");
      }
    }
  };

  const handleJoin = async () => {
    if (!name || !gender) return alert("חסר שם או מין");
    if (!hostId) return alert("קוד משחק שגוי");

    setLoading(true);

    try {
      const auth = await ensureAnonymousAuth();
      setIsAnonymous(auth.isAnonymous);

      // נביא session_id אם קיים (לא חובה כדי להצטרף – אחרת תראה שגיאה)
      const { data: gs, error: gsErr } = await supabase
        .from("game_states")
        .select("session_id, heat_level, status, current_player_id, last_active_player_id, challenge_type, challenge_text")
        .eq("host_id", hostId)
        .maybeSingle();

      if (gsErr) console.warn("game_states read warning:", gsErr.message);

      if (gs) {
        setGameState((prev: any) => ({ ...(prev || {}), ...(gs || {}) }));
        if (typeof gs.heat_level === "number") setLocalHeat(gs.heat_level);
      } else {
        // עדיין אין game_states -> המארח עוד לא פתח "חדר" בצד DB
        // עדיין נאפשר להצטרף לרשימת שחקנים (TV רואה players)
        setGameState(null);
      }

      const sid = (gs as any)?.session_id ?? null;

      // payload בסיסי שתמיד עובד
      const baseRow: any = {
        host_id: hostId,
        user_id: auth.userId,
        name,
        gender,
        avatar: imagePreview ?? "bg-pink-500",
      };

      // payload מתקדם (אם הוספת columns)
      const advancedRow: any = {
        ...baseRow,
        session_id: sid,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      // ננסה upsert מתקדם; אם ה-DB עוד לא מוכן/אין עמודות -> fallback לבסיסי
      let upsertRes:
        | { data: any; error: any }
        | null = null;

      // 1) try advanced ONLY if we got sid (optional)
      if (sid) {
        upsertRes = await supabase
          .from("players")
          .upsert([advancedRow], { onConflict: "host_id,user_id" })
          .select("id")
          .single();
      }

      // 2) if advanced not attempted or failed -> fallback to base
      if (!upsertRes || upsertRes.error) {
        if (upsertRes?.error) {
          const m = String(upsertRes.error.message || "");
          console.warn("advanced upsert failed:", m);
        }

        upsertRes = await supabase
          .from("players")
          .upsert([baseRow], { onConflict: "host_id,user_id" })
          .select("id")
          .single();
      }

      if (upsertRes.error) throw upsertRes.error;

      setMyPlayerId(upsertRes.data.id);
      localStorage.setItem(`player_id_${hostId}`, upsertRes.data.id);
      setIsSubmitted(true);
    } catch (e: any) {
      console.error(e);

      const msg = prettyErr(e);

      // הודעות עזר נפוצות
      if (msg.includes("no unique or exclusion constraint") || msg.includes("ON CONFLICT")) {
        alert(
          'שגיאת הצטרפות: חסר אינדקס ייחודי על players(host_id,user_id).\n' +
            "ב-Supabase SQL Editor צור unique index ואז נסה שוב."
        );
      } else if (msg.includes("row-level security") || msg.includes("RLS")) {
        alert(
          "שגיאת הצטרפות: RLS חוסם INSERT/UPSERT.\n" +
            "צריך פוליסי שמאפשר insert/update לשחקן על row עם user_id = auth.uid()."
        );
      } else if (msg.toLowerCase().includes("session_id") && msg.toLowerCase().includes("column")) {
        alert(
          "שגיאת הצטרפות: אין עמודה session_id/is_active ב-DB.\n" +
            "או שתוסיף אותן, או שתשאיר את הקוד על מצב legacy."
        );
      } else {
        alert("שגיאה בהצטרפות: " + msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // --- CONTROLLER VIEW ---
  if (isSubmitted && myPlayerId) {
    const isMyTurnToPlay = gameState?.current_player_id === myPlayerId;

    const isMyTurnToSpin =
      gameState?.last_active_player_id === myPlayerId &&
      (gameState?.status === "lobby" || gameState?.status === "waiting_for_spin");

    return (
      <div className="fixed inset-0 bg-gray-900 text-white flex flex-col overflow-hidden" dir="rtl">
        {/* Header */}
        <div className="pt-4 px-4 pb-2 bg-gray-800/50 backdrop-blur-md border-b border-gray-700/50 flex justify-between items-center z-10">
          <div className="flex items-center gap-3">
            {imagePreview && (
              <img src={imagePreview} className="w-8 h-8 rounded-full object-cover border border-white" />
            )}
            <span className="font-bold truncate max-w-[120px]">{name}</span>
          </div>
          <div className="flex gap-2 items-center">
            <div className="text-[10px] px-2 py-1 bg-green-500/20 text-green-400 rounded-full border border-green-500/30 flex items-center">
              מחובר
            </div>
            <div className="text-[10px] px-2 py-1 bg-cyan-500/15 text-cyan-300 rounded-full border border-cyan-500/20 flex items-center">
              {isAnonymous ? "אנונימי" : "משתמש"}
            </div>
            <button onClick={handleLeaveGame} className="p-1 bg-red-500/20 text-red-400 rounded-lg" title="צא מהמשחק">
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col justify-center items-center p-6 relative w-full max-w-md mx-auto overflow-y-auto">
          {isMyTurnToSpin ? (
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full space-y-6">
              <div className="text-center">
                <h2 className="text-3xl font-black mb-1 text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500">
                  {gameState?.status === "lobby" ? "אתה מתחיל!" : "השרביט אצלך!"}
                </h2>
                <p className="text-gray-400 text-sm">בחר רמת חום וסובב</p>
              </div>

              <div className="bg-gray-800/80 p-5 rounded-3xl border border-gray-700 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <span className="flex items-center gap-2 font-bold text-xl text-orange-400">
                    <Flame className="fill-orange-400" /> {localHeat}
                  </span>
                  <span className="text-xs text-gray-400 uppercase tracking-widest">
                    {localHeat < 4 ? "קליל" : localHeat < 8 ? "לוהט" : "אקסטרים"}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={localHeat}
                  onChange={(e) => handleHeatChange(parseInt(e.target.value))}
                  className="w-full h-8 bg-gray-700 rounded-full appearance-none cursor-pointer accent-pink-500"
                />
              </div>

              <button
                onClick={handleSpin}
                className="w-full py-6 bg-gradient-to-r from-pink-600 to-purple-600 rounded-3xl font-black text-3xl shadow-[0_0_30px_rgba(236,72,153,0.4)] active:scale-95 transition-transform flex items-center justify-center gap-3"
              >
                <RefreshCw size={32} className="animate-spin-slow" />{" "}
                {gameState?.status === "lobby" ? "התחל משחק" : "סובב!"}
              </button>
            </motion.div>
          ) : (
            <div className="w-full space-y-6">
              {isMyTurnToPlay && gameState?.status === "challenge" && (
                <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full">
                  <div className="bg-gray-800/90 p-6 rounded-3xl border-2 border-pink-500 shadow-2xl mb-4 text-center">
                    <h2 className="text-3xl font-black text-pink-400 mb-2">תורך!</h2>
                    <p className="text-white/80 text-lg">{gameState?.challenge_type}</p>
                  </div>

                  <button
                    onClick={() => sendAction("action_skip")}
                    className="w-full py-5 bg-red-500/20 hover:bg-red-500/30 text-red-200 border-2 border-red-500 rounded-2xl font-bold text-xl flex items-center justify-center gap-3 active:scale-95 transition-all"
                  >
                    <XCircle /> אני מוותר (שוט!)
                  </button>
                  <p className="text-center text-xs text-gray-500 mt-2">לחיצה תעביר את התור</p>
                </motion.div>
              )}

              {!isMyTurnToPlay && gameState?.status === "challenge" && (
                <div className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700">
                  <h3 className="text-center font-bold mb-4 text-gray-300">מה דעתך על הביצוע?</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => sendAction("vote_like")}
                      className="bg-green-600/80 p-4 rounded-xl flex justify-center active:scale-95 text-2xl hover:bg-green-500 transition-colors"
                    >
                      👍
                    </button>
                    <button
                      onClick={() => sendAction("vote_dislike")}
                      className="bg-red-600/80 p-4 rounded-xl flex justify-center active:scale-95 text-2xl hover:bg-red-500 transition-colors"
                    >
                      👎
                    </button>
                  </div>
                  <button
                    onClick={() => sendAction("vote_shot")}
                    className="w-full mt-3 bg-orange-600/80 p-3 rounded-xl font-bold flex justify-center items-center gap-2 active:scale-95 hover:bg-orange-500 transition-colors"
                  >
                    <Beer size={18} /> כולם שותים!
                  </button>
                </div>
              )}

              {gameState?.status !== "challenge" && (
                <div className="text-center text-gray-400 animate-pulse">
                  {gameState?.status === "spinning" && <div className="text-6xl animate-spin mb-4">🎲</div>}
                  <p className="text-xl font-bold">
                    {gameState?.status === "lobby"
                      ? "ממתינים למארח..."
                      : gameState?.status === "waiting_for_spin"
                      ? "ממתינים לסיבוב..."
                      : gameState?.status === "spinning"
                      ? "מגריל..."
                      : gameState?.status === "penalty"
                      ? "שוט!"
                      : "המשחק רץ בטלוויזיה..."}
                  </p>
                </div>
              )}

              {!gameState && (
                <div className="text-center text-gray-500 text-sm">
                  המארח עדיין לא יצר מצב משחק (game_states).
                  <br />
                  תנסה לרענן אחרי שהמארח נכנס למסך TV.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Emoji Bar */}
        <div className="w-full pt-3 pb-6 bg-gray-900 border-t border-gray-800 z-10">
          <p className="text-center text-[10px] text-gray-500 mb-2 font-bold uppercase tracking-widest">תגובה מהירה</p>
          <div className="flex justify-between gap-2 overflow-x-auto pb-2 scrollbar-hide px-2">
            {[{ icon: "😂" }, { icon: "😱" }, { icon: "😍" }, { icon: "🤢" }, { icon: "😈" }, { icon: "🫣" }, { icon: "🔥" }].map(
              (item, idx) => (
                <button
                  key={idx}
                  onClick={() => sendAction("emoji", item.icon)}
                  className="bg-gray-800 p-3 rounded-2xl text-2xl active:scale-75 transition-transform shadow-md border border-gray-700 flex-shrink-0 hover:bg-gray-700"
                >
                  {item.icon}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- הרשמה ---
  if (!hostId) {
    return (
      <div className="text-white p-10 text-center flex flex-col items-center justify-center h-screen">
        <AlertTriangle size={48} className="text-red-500 mb-4" />
        קוד משחק שגוי
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-black text-white p-6 flex flex-col items-center justify-center text-center" dir="rtl">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <div className="text-[11px] px-3 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-cyan-200">
            אתה מחובר כ{isAnonymous ? "אנונימי" : "משתמש"}
          </div>
        </div>

        <div className="relative mx-auto w-32 h-32">
          <label className="cursor-pointer block w-full h-full rounded-full border-4 border-dashed border-gray-700 hover:border-pink-500 overflow-hidden transition-colors">
            {imagePreview ? (
              <img src={imagePreview} className="w-full h-full object-cover" />
            ) : (
              <Camera className="w-full h-full p-8 text-gray-600" />
            )}
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>
        </div>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="השם שלך"
          className="w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-center text-xl focus:border-pink-500 outline-none"
        />

        <div className="flex gap-2 justify-center">
          {[{ id: "male", l: "גבר" }, { id: "female", l: "אישה" }, { id: "other", l: "אחר" }].map((o) => (
            <button
              key={o.id}
              onClick={() => setGender(o.id as any)}
              className={`px-4 py-2 rounded-lg border ${
                gender === o.id ? "bg-pink-600 border-pink-500" : "border-gray-800"
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>

        <button
          onClick={handleJoin}
          disabled={loading}
          className="w-full bg-pink-600 py-4 rounded-xl font-black text-xl shadow-lg disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin mx-auto" /> : "יאללה מתחילים!"}
        </button>

        {!gameState && (
          <div className="text-[11px] text-gray-500">
            אם זה שחקן ראשון: תוודא שהמארח נכנס למסך המשחק בטלוויזיה (כדי ש־game_states יווצר).
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlayerJoinPage() {
  return (
    <Suspense fallback={<div className="bg-black h-screen text-white flex items-center justify-center">טוען...</div>}>
      <GameController />
    </Suspense>
  );
}
