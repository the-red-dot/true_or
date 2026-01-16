// truth-or-dare-ai/src/app/join/page.tsx
"use client";

import React, { useEffect, useRef, useState, Suspense } from "react";
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
import type { RealtimeChannel, User } from "@supabase/supabase-js";

// --- Broadcast event types ---
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

type GameStateRow = {
  host_id: string;
  status: string | null;
  current_player_id: string | null;
  last_active_player_id: string | null;
  heat_level: number | null;
  challenge_text: string | null;
  challenge_type: string | null;
  session_id: string | null;
};

type PlayerRow = {
  id: string;
  host_id: string;
  user_id: string;
  name: string;
  gender: "male" | "female" | "other";
  avatar: string;
  is_active: boolean | null;
  session_id: string | null;
};

function GameController() {
  const searchParams = useSearchParams();
  const hostId = searchParams.get("hostId");

  // Registration State
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other" | "">("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  // Auth / status
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Game Logic State
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null); // players.id
  const [gameState, setGameState] = useState<GameStateRow | null>(null);
  const [localHeat, setLocalHeat] = useState(1);

  // refs to avoid stale closures
  const myPlayerIdRef = useRef<string | null>(null);
  const myUserIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    myPlayerIdRef.current = myPlayerId;
  }, [myPlayerId]);

  // Broadcast channel (reuse instead of creating every click)
  const broadcastRef = useRef<RealtimeChannel | null>(null);

  const handleKicked = (opts?: { keepInputs?: boolean }) => {
    if (hostId) localStorage.removeItem(`player_id_${hostId}`);
    setMyPlayerId(null);
    setIsSubmitted(false);

    if (!opts?.keepInputs) {
      // keep inputs if you want quicker re-join; change to true if you prefer
      // setName("");
      // setGender("");
      // setImagePreview(null);
    }
  };

  // 1) Ensure anonymous auth session on phone
  useEffect(() => {
    if (!hostId) return;

    (async () => {
      try {
        const { data: s0, error: e0 } = await supabase.auth.getSession();
        if (e0) console.error("getSession error:", e0);

        if (!s0.session) {
          const { error } = await supabase.auth.signInAnonymously();
          if (error) throw error;
        }

        const { data: u, error: ue } = await supabase.auth.getUser();
        if (ue) throw ue;

        setAuthUser(u.user ?? null);
        myUserIdRef.current = u.user?.id ?? null;
      } catch (e) {
        console.error("anonymous auth failed:", e);
      } finally {
        setAuthReady(true);
      }
    })();
  }, [hostId]);

  // 2) Load initial game state
  useEffect(() => {
    if (!hostId) return;

    supabase
      .from("game_states")
      .select("*")
      .eq("host_id", hostId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error("load game_states error:", error);
          setGameState(null);
          sessionIdRef.current = null;
          return;
        }
        const gs = data as GameStateRow;
        setGameState(gs);
        sessionIdRef.current = gs.session_id ?? null;
        setLocalHeat(gs.heat_level ?? 1);
      });
  }, [hostId]);

  // 3) Setup realtime listeners (game_states + players) + broadcast channel
  useEffect(() => {
    if (!hostId) return;

    // broadcast channel (for sending events)
    const bc = supabase.channel(`room_${hostId}`);
    broadcastRef.current = bc;
    bc.subscribe();

    // game state updates
    const gameStateChannel = supabase
      .channel(`gamestate_listener_${hostId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_states", filter: `host_id=eq.${hostId}` },
        (payload) => {
          const next = payload.new as GameStateRow;
          setGameState(next);
          setLocalHeat(next.heat_level ?? 1);

          // New game started (session_id changed) => kick local player back to join screen
          const nextSession = next.session_id ?? null;
          if (nextSession && nextSession !== sessionIdRef.current) {
            sessionIdRef.current = nextSession;
            if (myPlayerIdRef.current) handleKicked({ keepInputs: true });
          }
        }
      )
      .subscribe();

    // player updates (handle "leave" via is_active=false, or session move)
    const playersChannel = supabase
      .channel(`players_listener_${hostId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "players", filter: `host_id=eq.${hostId}` },
        (payload) => {
          const next = payload.new as PlayerRow;
          const myUid = myUserIdRef.current;
          if (!myUid) return;

          // if my row became inactive OR moved to other session, drop to join screen
          if (next.user_id === myUid) {
            const curSession = sessionIdRef.current;
            const isWrongSession = curSession && next.session_id !== curSession;
            const isInactive = next.is_active === false;
            if (isWrongSession || isInactive) handleKicked({ keepInputs: true });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "players", filter: `host_id=eq.${hostId}` },
        (payload) => {
          // just in case someone deletes rows manually
          const deletedId = (payload.old as any)?.id;
          if (deletedId && deletedId === myPlayerIdRef.current) handleKicked({ keepInputs: true });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(gameStateChannel);
      supabase.removeChannel(playersChannel);
      supabase.removeChannel(bc);
      if (broadcastRef.current === bc) broadcastRef.current = null;
    };
  }, [hostId]);

  // 4) Try restore session (auto re-join) only if row exists & active for current session_id
  useEffect(() => {
    if (!hostId) return;
    if (!authReady) return;
    const myUid = myUserIdRef.current;
    const sessionId = sessionIdRef.current;
    if (!myUid || !sessionId) return;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("players")
          .select("id,name,gender,avatar,is_active,session_id,user_id,host_id")
          .eq("host_id", hostId)
          .eq("user_id", myUid)
          .eq("session_id", sessionId)
          .maybeSingle();

        if (error) {
          console.error("restore player error:", error);
          return;
        }

        if (data && (data as PlayerRow).is_active !== false) {
          const p = data as PlayerRow;
          setMyPlayerId(p.id);
          setIsSubmitted(true);
          setName(p.name ?? "");
          setGender((p.gender as any) ?? "");
          setImagePreview(p.avatar ?? null);
          localStorage.setItem(`player_id_${hostId}`, p.id);
        }
      } catch (e) {
        console.error("restore player failed:", e);
      }
    })();
  }, [hostId, authReady, gameState?.session_id]);

  const sendAction = async (type: GameEvent["type"], payload: any = {}) => {
    if (!hostId || !myPlayerIdRef.current) return;
    const ch = broadcastRef.current;
    if (!ch) return;

    await ch.send({
      type: "broadcast",
      event: "game_event",
      payload: { type, payload, playerId: myPlayerIdRef.current },
    });
  };

  const handleHeatChange = (val: number) => {
    setLocalHeat(val);
    sendAction("update_heat", val);
  };

  const handleSpin = () => {
    sendAction("trigger_spin");
  };

  // Leave game: NO DELETE. Just mark inactive.
  const handleLeaveGame = async () => {
    if (!confirm("האם אתה בטוח שברצונך לצאת מהמשחק?")) return;
    const pid = myPlayerIdRef.current;
    const myUid = myUserIdRef.current;
    if (!pid || !myUid) return;

    try {
      // 1) instant UI on TV
      await sendAction("player_left");

      // 2) mark inactive in DB (requires UPDATE RLS policy)
      const { error } = await supabase
        .from("players")
        .update({ is_active: false })
        .eq("id", pid)
        .eq("user_id", myUid);

      if (error) {
        console.error("update is_active=false error:", error);
        alert("לא הצלחתי לצאת (בדוק RLS ל-UPDATE עם WITH CHECK user_id=auth.uid())");
        return;
      }

      // 3) local exit
      handleKicked({ keepInputs: true });
    } catch (e) {
      console.error("leave game failed:", e);
      alert("שגיאה ביציאה מהמשחק");
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
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setImagePreview(compressed);
    } catch {
      alert("שגיאה בתמונה");
    }
  };

  const handleJoin = async () => {
    if (!name || !gender) return alert("חסר שם או מין");
    if (!hostId) return alert("קוד משחק שגוי");
    const sessionId = sessionIdRef.current;
    if (!sessionId) return alert("החדר לא מוכן עדיין (אין session_id). רענן את הטלוויזיה/הדף.");

    setLoading(true);

    try {
      // Ensure session exists (anonymous)
      const { data: s, error: se } = await supabase.auth.getSession();
      if (se) throw se;
      if (!s.session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
      }

      const { data: u, error: ue } = await supabase.auth.getUser();
      if (ue || !u.user) throw ue ?? new Error("No user");
      const userId = u.user.id;
      myUserIdRef.current = userId;
      setAuthUser(u.user);

      // Upsert player row for this host + user, set active & attach to current session_id
      const { data, error } = await supabase
        .from("players")
        .upsert(
          [
            {
              host_id: hostId,
              user_id: userId,
              session_id: sessionId,
              is_active: true,
              name,
              gender,
              avatar: imagePreview ?? "bg-pink-500",
            },
          ],
          { onConflict: "host_id,user_id" }
        )
        .select("id")
        .single();

      if (error) throw error;

      setMyPlayerId(data.id);
      localStorage.setItem(`player_id_${hostId}`, data.id);
      setIsSubmitted(true);
    } catch (e: any) {
      console.error("join failed:", e);
      alert(
        `שגיאה בהצטרפות: ${e?.message ?? "RLS/INSERT/UPSERT"}\n\nאם זה RLS: ודא שיש INSERT+UPDATE פוליסיז עם WITH CHECK (user_id = auth.uid()).`
      );
    } finally {
      setLoading(false);
    }
  };

  // --- CONTROLLER VIEW ---
  if (isSubmitted && myPlayerId && gameState) {
    const isMyTurnToPlay = gameState.current_player_id === myPlayerId;

    const isMyTurnToSpin =
      gameState.last_active_player_id === myPlayerId &&
      (gameState.status === "lobby" || gameState.status === "waiting_for_spin");

    const isAnonymous = (authUser as any)?.is_anonymous === true;

    return (
      <div className="fixed inset-0 bg-gray-900 text-white flex flex-col overflow-hidden" dir="rtl">
        {/* Header */}
        <div className="pt-4 px-4 pb-2 bg-gray-800/50 backdrop-blur-md border-b border-gray-700/50 flex justify-between items-center z-10">
          <div className="flex items-center gap-3">
            {imagePreview && <img src={imagePreview} className="w-8 h-8 rounded-full object-cover border border-white" />}
            <span className="font-bold truncate max-w-[140px]">{name}</span>
          </div>

          <div className="flex gap-2 items-center">
            <div className="text-[10px] px-2 py-1 bg-green-500/20 text-green-400 rounded-full border border-green-500/30 flex items-center">
              {isAnonymous ? "מחובר כאנונימי" : "מחובר"}
            </div>
            <button onClick={handleLeaveGame} className="p-1 bg-red-500/20 text-red-400 rounded-lg" title="צא מהמשחק">
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col justify-center items-center p-6 relative w-full max-w-md mx-auto overflow-y-auto">
          {/* --- SPIN CONTROLS (Only for the Wand Holder) --- */}
          {isMyTurnToSpin ? (
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full space-y-6">
              <div className="text-center">
                <h2 className="text-3xl font-black mb-1 text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500">
                  {gameState.status === "lobby" ? "אתה מתחיל!" : "השרביט אצלך!"}
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
                {gameState.status === "lobby" ? "התחל משחק" : "סובב!"}
              </button>
            </motion.div>
          ) : (
            <div className="w-full space-y-6">
              {/* Active Player Controls */}
              {isMyTurnToPlay && gameState.status === "challenge" && (
                <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full">
                  <div className="bg-gray-800/90 p-6 rounded-3xl border-2 border-pink-500 shadow-2xl mb-4 text-center">
                    <h2 className="text-3xl font-black text-pink-400 mb-2">תורך!</h2>
                    <p className="text-white/80 text-lg">{gameState.challenge_type}</p>
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

              {/* Spectator View */}
              {!isMyTurnToPlay && gameState.status === "challenge" && (
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

              {/* Waiting states */}
              {gameState.status !== "challenge" && (
                <div className="text-center text-gray-400 animate-pulse">
                  {gameState.status === "spinning" && <div className="text-6xl animate-spin mb-4">🎲</div>}
                  <p className="text-xl font-bold">
                    {gameState.status === "lobby"
                      ? "ממתינים למארח..."
                      : gameState.status === "waiting_for_spin"
                      ? "ממתינים לסיבוב..."
                      : gameState.status === "spinning"
                      ? "מגריל..."
                      : gameState.status === "penalty"
                      ? "שוט!"
                      : "המשחק רץ בטלוויזיה..."}
                  </p>
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

  // --- Registration ---
  if (!hostId) {
    return (
      <div className="text-white p-10 text-center flex flex-col items-center justify-center h-screen">
        <AlertTriangle size={48} className="text-red-500 mb-4" />
        קוד משחק שגוי
      </div>
    );
  }

  const isAnonymous = (authUser as any)?.is_anonymous === true;

  return (
    <div className="min-h-[100dvh] bg-black text-white p-6 flex flex-col items-center justify-center text-center" dir="rtl">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <div className="text-[10px] px-2 py-1 bg-white/5 text-gray-300 rounded-full border border-white/10">
            {authReady ? (isAnonymous ? "סטטוס: מחובר כאנונימי" : "סטטוס: מחובר") : "מאתחל התחברות..."}
          </div>
        </div>

        <div className="relative mx-auto w-32 h-32">
          <label className="cursor-pointer block w-full h-full rounded-full border-4 border-dashed border-gray-700 hover:border-pink-500 overflow-hidden transition-colors">
            {imagePreview ? <img src={imagePreview} className="w-full h-full object-cover" /> : <Camera className="w-full h-full p-8 text-gray-600" />}
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
              className={`px-4 py-2 rounded-lg border ${gender === o.id ? "bg-pink-600 border-pink-500" : "border-gray-800"}`}
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

        {!gameState?.session_id && (
          <div className="text-xs text-yellow-300/80 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
            אין session_id לחדר עדיין. ודא שבטלוויזיה נוצר row ב-<b>game_states</b> עבור המארח, ושבסיום משחק אתה מייצר session_id חדש.
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
