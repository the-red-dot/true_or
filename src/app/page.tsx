// truth-or-dare-ai\src\app\page.tsx

"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Flame,
  Trash2,
  LogOut,
  User as UserIcon,
  WifiOff,
  RefreshCw,
  Cpu,
  Beer,
  ThumbsUp,
  ThumbsDown,
  LogIn,
  Play,
} from "lucide-react";
import confetti from "canvas-confetti";
import QRCode from "react-qr-code";
import { supabase } from "@/app/lib/supabase";
import Link from "next/link";
import { User } from "@supabase/supabase-js";
import { RealtimeChannel } from "@supabase/supabase-js";

// --- Types ---
type Player = {
  id: string;
  created_at?: string;
  name: string;
  gender: "male" | "female" | "other";
  avatar: string;
  host_id: string;
  user_id: string;
  // NEW (DB fields)
  session_id?: string | null;
  is_active?: boolean | null;
};

type Challenge = {
  content: string;
  spiciness: number;
  themeColor: string;
  usedModel?: string;
};

type Reaction = { id: string; emoji: string; playerId: string; x: number };

export default function TruthOrDareGame() {
  // --- State ---
  const [gameState, setGameState] = useState<
    "lobby" | "waiting_for_spin" | "spinning" | "spotlight" | "revealing" | "challenge" | "penalty"
  >("lobby");
  const [players, setPlayers] = useState<Player[]>([]);
  const [heatLevel, setHeatLevel] = useState<number>(1);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [lastActivePlayer, setLastActivePlayer] = useState<Player | null>(null); // השחקן השולט כרגע
  const [challengeType, setChallengeType] = useState<"אמת" | "חובה" | null>(null);
  const [currentChallenge, setCurrentChallenge] = useState<Challenge | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");

  // Auth & Connection State
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(true);

  // NEW: current session id for the game (no DB deletes, only sessions)
  const [sessionId, setSessionId] = useState<string | null>(null);

  // --- Interactive State ---
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [votes, setVotes] = useState<{ likes: number; dislikes: number; shots: number }>({
    likes: 0,
    dislikes: 0,
    shots: 0,
  });
  const [shotVoteMode, setShotVoteMode] = useState(false);

  // --- Helpers ---
  const genSessionId = () => {
    // crypto.randomUUID exists in modern browsers
    try {
      // @ts-ignore
      if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    } catch {}
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const isActiveRow = (p: any, sid: string | null) => {
    if (!sid) return false;
    return p?.session_id === sid && p?.is_active === true;
  };

  // stateRef for realtime handlers (avoid stale closures)
  const stateRef = useRef({ players, lastActivePlayer, gameState, sessionId });
  useEffect(() => {
    stateRef.current = { players, lastActivePlayer, gameState, sessionId };
  }, [players, lastActivePlayer, gameState, sessionId]);

  // --- Turn management (first player is controller) ---
  useEffect(() => {
    if (players.length === 0) {
      if (lastActivePlayer !== null) setLastActivePlayer(null);
      return;
    }

    const activePlayerStillHere =
      lastActivePlayer && players.find((p) => p.id === lastActivePlayer.id);

    if (!activePlayerStillHere) {
      const newController = players[0];
      setLastActivePlayer(newController);
      syncGameStateToDB(gameState, selectedPlayer?.id, currentChallenge, newController.id);
    } else {
      if (gameState === "lobby" || gameState === "waiting_for_spin") {
        syncGameStateToDB(gameState, selectedPlayer?.id, currentChallenge, lastActivePlayer?.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players.length, gameState]);

  // --- Sync Game State to DB ---
  const syncGameStateToDB = async (
    status: string,
    currentPlayerId: string | null = null,
    challenge: any = null,
    forceControllerId: string | undefined | null = undefined
  ) => {
    if (!authUser) return;

    let activeControllerId =
      forceControllerId !== undefined ? forceControllerId : lastActivePlayer?.id;

    if (!activeControllerId && players.length > 0) {
      activeControllerId = players[0].id;
    }

    const sid = sessionId ?? stateRef.current.sessionId;

    await supabase.from("game_states").upsert({
      host_id: authUser.id,
      session_id: sid, // NEW
      status,
      current_player_id: currentPlayerId,
      last_active_player_id: activeControllerId,
      heat_level: heatLevel,
      challenge_text: challenge?.content || null,
      challenge_type: challengeType,
      updated_at: new Date().toISOString(),
    });
  };

  // Keep syncing important changes
  useEffect(() => {
    // only if we have a session already (host is ready)
    if (authUser && sessionId) {
      syncGameStateToDB(gameState, selectedPlayer?.id, currentChallenge);
    }

    if (gameState !== "challenge") {
      setVotes({ likes: 0, dislikes: 0, shots: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, selectedPlayer, currentChallenge, heatLevel, sessionId]);

  // Always set join URL
  useEffect(() => {
    if (authUser && typeof window !== "undefined") {
      setJoinUrl(`${window.location.origin}/join?hostId=${authUser.id}`);
    }
  }, [authUser]);

  // --- Realtime + initial load ---
  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let gsChannel: RealtimeChannel | null = null;

    const loadOrCreateGameState = async (hostId: string) => {
      // Try fetch existing game state
      const gs = await supabase
        .from("game_states")
        .select("*")
        .eq("host_id", hostId)
        .single();

      if (gs.data?.session_id) {
        setSessionId(gs.data.session_id);
        // keep local heat in sync
        if (gs.data.heat_level) setHeatLevel(gs.data.heat_level);
        // optional: keep local gameState if you want to restore
        // if (gs.data.status) setGameState(gs.data.status);
        return gs.data.session_id as string;
      }

      // Create default row if missing
      const created = await supabase
        .from("game_states")
        .upsert({
          host_id: hostId,
          status: "lobby",
          current_player_id: null,
          last_active_player_id: null,
          challenge_text: null,
          challenge_type: null,
          heat_level: 1,
          session_id: genSessionId(),
          updated_at: new Date().toISOString(),
        })
        .select("session_id, heat_level, status")
        .single();

      const sid = created.data?.session_id ?? null;
      setSessionId(sid);
      if (created.data?.heat_level) setHeatLevel(created.data.heat_level);
      return sid as string;
    };

    const loadPlayersForSession = async (hostId: string, sid: string) => {
      const { data } = await supabase
        .from("players")
        .select("*")
        .eq("host_id", hostId)
        .eq("session_id", sid)
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      if (data) setPlayers(data as Player[]);
      else setPlayers([]);
    };

    const setupRealtime = async (hostId: string) => {
      const sid = await loadOrCreateGameState(hostId);
      if (sid) await loadPlayersForSession(hostId, sid);

      // Listen to game_states updates (session changes -> clear players UI)
      gsChannel = supabase
        .channel(`gamestate_host_${hostId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "game_states", filter: `host_id=eq.${hostId}` },
          (payload) => {
            const next = payload.new as any;
            const nextSid: string | null = next?.session_id ?? null;

            // Session changed -> hard reset host UI players list etc.
            if (nextSid && nextSid !== stateRef.current.sessionId) {
              setSessionId(nextSid);
              setPlayers([]);
              setGameState("lobby");
              setLastActivePlayer(null);
              setSelectedPlayer(null);
              setCurrentChallenge(null);
              setChallengeType(null);
              setHeatLevel(next?.heat_level ?? 1);
              return;
            }

            // keep heat synced if needed
            if (typeof next?.heat_level === "number") setHeatLevel(next.heat_level);
          }
        )
        .subscribe();

      channel = supabase
        .channel(`room_${hostId}`)

        // INSERT: only current session + active
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "players", filter: `host_id=eq.${hostId}` },
          (payload) => {
            const np = payload.new as any;
            const sidNow = stateRef.current.sessionId;
            if (!isActiveRow(np, sidNow)) return;

            setPlayers((prev) => (prev.some((p) => p.id === np.id) ? prev : [...prev, np]));
          }
        )

        // UPDATE: if becomes inactive or session changed -> remove; else upsert into list
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "players", filter: `host_id=eq.${hostId}` },
          (payload) => {
            const up = payload.new as any;
            const sidNow = stateRef.current.sessionId;

            if (!isActiveRow(up, sidNow)) {
              setPlayers((prev) => prev.filter((p) => p.id !== up.id));
              return;
            }

            setPlayers((prev) => {
              const exists = prev.some((p) => p.id === up.id);
              return exists ? prev.map((p) => (p.id === up.id ? up : p)) : [...prev, up];
            });
          }
        )

        // (No DELETE needed in this tactic)
        .on("broadcast", { event: "game_event" }, (event) => handleGameEvent(event.payload))
        .subscribe((status) => setIsConnected(status === "SUBSCRIBED"));
    };

    const handleGameEvent = (data: any) => {
      const { type, payload, playerId } = data;

      // Security/consistency: ignore control events from players not in current session list
      const allowedTypes = new Set([
        "emoji",
        "action_skip",
        "vote_like",
        "vote_dislike",
        "vote_shot",
        "trigger_spin",
        "update_heat",
        "player_left",
      ]);
      if (!allowedTypes.has(type)) return;

      const exists = stateRef.current.players.some((p) => p.id === playerId);
      const isControl =
        type !== "emoji" && type !== "player_left"; // emoji can be fun; still require exists? choose strict:
      if ((isControl || type === "emoji" || type === "player_left") && !exists) {
        // If you want emojis only from current players, keep this.
        return;
      }

      if (type === "emoji") {
        const id = Math.random().toString(36);
        const randomX = Math.random() * 80 + 10;
        setReactions((prev) => [...prev, { id, emoji: payload, playerId, x: randomX }]);
        setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 4000);
      }

      if (type === "update_heat") setHeatLevel(payload);
      if (type === "trigger_spin") spinTheWheel();
      if (type === "action_skip") handleSkip();

      // Player left: new tactic => no DB delete, only optimistic UI (DB update done on phone)
      if (type === "player_left") {
        setPlayers((prev) => prev.filter((p) => p.id !== playerId));
      }

      if (type === "vote_like") setVotes((v) => ({ ...v, likes: v.likes + 1 }));
      if (type === "vote_dislike") setVotes((v) => ({ ...v, dislikes: v.dislikes + 1 }));

      if (type === "vote_shot") {
        setVotes((v) => {
          const newShots = v.shots + 1;
          const threshold = Math.max(2, Math.floor(stateRef.current.players.length / 2));
          if (newShots >= threshold && !shotVoteMode) triggerGroupShot();
          return { ...v, shots: newShots };
        });
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setAuthUser(session.user);
        setupRealtime(session.user.id);
      } else {
        setAuthUser(null);
        setPlayers([]);
        setJoinUrl("");
        setSessionId(null);
        if (channel) supabase.removeChannel(channel);
        if (gsChannel) supabase.removeChannel(gsChannel);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
      if (gsChannel) supabase.removeChannel(gsChannel);
      // IMPORTANT: no DB deletes on cleanup in this tactic
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto votes logic
  useEffect(() => {
    if (gameState !== "challenge") return;
    const voters = Math.max(1, players.length - 1);
    if (votes.likes > voters * 0.5) handleDone();
    else if (votes.dislikes > voters * 0.5) handleSkip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [votes, players.length, gameState]);

  // --- Game Flow ---
  const spinTheWheel = () => {
    const currentPlayers = stateRef.current.players;
    if (currentPlayers.length < 2) return alert("צריך לפחות 2 שחקנים כדי להתחיל!");

    setGameState("spinning");
    playSpinSound();

    setTimeout(() => {
      const randomPlayer = currentPlayers[Math.floor(Math.random() * currentPlayers.length)];
      setSelectedPlayer(randomPlayer);
      setChallengeType(Math.random() > 0.5 ? "אמת" : "חובה");
      setGameState("spotlight");
    }, 3000);
  };

  useEffect(() => {
    if (gameState === "spotlight") {
      const t = setTimeout(() => setGameState("revealing"), 3000);
      return () => clearTimeout(t);
    }
  }, [gameState]);

  useEffect(() => {
    if (gameState === "revealing" && selectedPlayer && challengeType && authUser) {
      setLoadingAI(true);
      const prevTasks: string[] = [];

      fetch("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          playerName: selectedPlayer.name,
          playerGender: selectedPlayer.gender,
          heatLevel: heatLevel,
          type: challengeType,
          previousChallenges: prevTasks,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          setCurrentChallenge(data);
          setGameState("challenge");
        })
        .catch(() => setGameState("challenge"))
        .finally(() => setLoadingAI(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  const handleDone = () => {
    confetti({ particleCount: 200, spread: 120 });
    setLastActivePlayer(selectedPlayer);

    setTimeout(() => {
      setGameState("waiting_for_spin");
      setSelectedPlayer(null);
    }, 3000);
  };

  const handleSkip = () => {
    setGameState("penalty");
    playShotSound();

    setTimeout(() => {
      setLastActivePlayer(selectedPlayer);
      setGameState("waiting_for_spin");
      setSelectedPlayer(null);
    }, 5000);
  };

  const triggerGroupShot = () => {
    setShotVoteMode(true);
    playShotSound();
    setTimeout(() => {
      setShotVoteMode(false);
      setGameState("waiting_for_spin");
    }, 5000);
  };

  const handleManualRefresh = async () => {
    if (!authUser) return;

    // Ensure we have current session
    let sid = sessionId;
    if (!sid) {
      const gs = await supabase.from("game_states").select("session_id").eq("host_id", authUser.id).single();
      sid = (gs.data?.session_id as string) ?? null;
      setSessionId(sid);
    }
    if (!sid) return;

    const { data } = await supabase
      .from("players")
      .select("*")
      .eq("host_id", authUser.id)
      .eq("session_id", sid)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (data) {
      setPlayers(data as Player[]);
      if (!lastActivePlayer && data.length > 0) {
        setLastActivePlayer(data[0] as Player);
      }
    }
  };

  const handleLogout = async () => {
    if (confirm("האם אתה בטוח שברצונך להתנתק? זה יסגור את החדר.")) {
      // No deletes. Just sign out.
      await supabase.auth.signOut();
    }
  };

  // NEW: End game = new session_id, reset game state (no DB deletes)
  const endGame = async (askConfirm = true) => {
    if (!authUser) return;
    if (askConfirm && !confirm("לסיים משחק ולהתחיל חדש (0 שחקנים, בלי למחוק DB)?")) return;

    const newSid = genSessionId();

    const { error } = await supabase.from("game_states").upsert({
      host_id: authUser.id,
      session_id: newSid,
      status: "lobby",
      current_player_id: null,
      last_active_player_id: null,
      challenge_text: null,
      challenge_type: null,
      heat_level: 1,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.error("endGame error:", error);
      alert("סיום משחק נכשל (בדוק RLS / חיבור).");
      return;
    }

    // Reset local UI
    setSessionId(newSid);
    setPlayers([]);
    setGameState("lobby");
    setLastActivePlayer(null);
    setSelectedPlayer(null);
    setCurrentChallenge(null);
    setChallengeType(null);
    setHeatLevel(1);
  };

  const handleHeatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHeatLevel(parseInt(e.target.value));
  };

  const playSpinSound = () => {
    /* Play spin.mp3 */
  };
  const playWinSound = () => {
    /* Play win.mp3 */
  };
  const playShotSound = () => {
    /* Play shot.mp3 */
  };

  return (
    <main
      className="h-screen w-full bg-black text-white font-sans overflow-hidden relative selection:bg-pink-500 flex flex-col"
      dir="rtl"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-black to-black z-0 pointer-events-none" />

      {/* Top Bar */}
      {authUser && (
        <div className="absolute top-6 left-6 z-40 flex items-center gap-4 bg-black/40 backdrop-blur px-4 py-2 rounded-full border border-white/10">
          <div className="flex flex-col text-left">
            <span className="text-xs text-gray-400 font-bold uppercase">קוד חדר</span>
            <span className="text-xl font-mono text-pink-500 tracking-widest">
              {authUser.email?.split("@")[0] || "..."}
            </span>
          </div>
          <div className="h-8 w-px bg-white/20"></div>
          <div className="flex items-center gap-2">
            <UserIcon size={16} /> {players.length}
          </div>
          <button
            onClick={handleManualRefresh}
            className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-400"
            title="רענון"
          >
            <RefreshCw size={16} />
          </button>

          <button
            onClick={() => endGame(true)}
            className="p-2 hover:bg-red-500/20 rounded-full transition-colors text-red-400"
            title="סיום משחק (איפוס בלי מחיקה)"
          >
            <Trash2 size={20} />
          </button>

          <button
            onClick={handleLogout}
            className="p-2 hover:bg-red-500/20 rounded-full transition-colors text-red-400"
            title="התנתק"
          >
            <LogOut size={16} />
          </button>

          {!isConnected && <WifiOff className="text-red-500 animate-pulse" />}
        </div>
      )}

      {/* --- Global Emojis Overlay --- */}
      <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
        <AnimatePresence>
          {reactions.map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, scale: 0.5, y: "100vh", x: `${r.x}vw` }}
              animate={{ opacity: 1, scale: [1, 1.5, 1], y: "-20vh" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 4, ease: "easeOut" }}
              className="absolute text-7xl md:text-8xl drop-shadow-[0_0_15px_rgba(0,0,0,0.8)]"
            >
              {r.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* --- Main Game Area --- */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 p-10 h-full">
        {!authUser && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center text-center space-y-8 p-10 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-xl"
          >
            <div className="bg-pink-600/20 p-6 rounded-full">
              <Trash2 className="w-20 h-20 text-pink-500 opacity-50" />
            </div>
            <h1 className="text-5xl font-black">המשחק נותק</h1>
            <p className="text-xl text-gray-400 max-w-md">
              כדי לייצר קוד QR ולהתחיל משחק חדש, עליך להתחבר כמארח.
            </p>
            <Link
              href="/login"
              className="px-10 py-5 bg-gradient-to-r from-pink-600 to-purple-600 rounded-2xl font-bold text-2xl shadow-xl hover:scale-105 transition-transform flex items-center gap-4"
            >
              <LogIn size={32} /> התחבר מחדש
            </Link>
          </motion.div>
        )}

        {authUser && (gameState === "lobby" || gameState === "waiting_for_spin") && (
          <div className="flex flex-col items-center w-full max-w-6xl h-full justify-center">
            <h1 className="text-8xl md:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 drop-shadow-[0_0_30px_rgba(236,72,153,0.5)] mb-12 tracking-tighter">
              {gameState === "lobby" ? "אמת או חובה" : "הבא בתור..."}
            </h1>

            <div className="flex flex-wrap justify-center gap-8 px-4">
              {players.length === 0 && (
                <div className="text-2xl text-gray-500 animate-pulse">
                  ממתין לשחקנים... סרקו את הקוד
                </div>
              )}

              {players.map((p) => {
                const isController = lastActivePlayer?.id === p.id;

                return (
                  <div key={p.id} className="relative group">
                    <div
                      className={`w-28 h-28 rounded-full border-4 overflow-hidden transition-all duration-300 relative ${
                        isController
                          ? "border-yellow-400 shadow-[0_0_40px_rgba(250,204,21,0.6)] scale-110"
                          : "border-white/20"
                      }`}
                    >
                      {p.avatar.startsWith("bg-") ? (
                        <div className={`w-full h-full ${p.avatar}`} />
                      ) : (
                        <img src={p.avatar} className="w-full h-full object-cover" />
                      )}
                      {isController && (
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <RefreshCw className="text-white w-10 h-10 animate-spin-slow" />
                        </div>
                      )}
                    </div>
                    <div className="text-center mt-2 font-bold text-lg drop-shadow-md">
                      {p.name}
                    </div>
                    {isController && (
                      <div className="text-center text-yellow-400 text-xs font-bold animate-pulse">
                        מחזיק בשרביט
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Host controls */}
            <div className="mt-12 bg-white/5 backdrop-blur-xl p-4 rounded-2xl border border-white/10 flex items-center gap-6">
              {gameState === "lobby" && players.length >= 2 && (
                <button
                  onClick={spinTheWheel}
                  className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-500 rounded-xl font-bold flex items-center gap-2 hover:scale-105 transition-transform shadow-lg"
                >
                  <Play className="fill-white" /> התחל משחק
                </button>
              )}
              <span className="text-cyan-400 font-bold flex items-center gap-2 border-r border-white/20 pr-6 mr-2">
                <Flame /> {heatLevel}
              </span>
              <input
                type="range"
                min="1"
                max="10"
                value={heatLevel}
                onChange={handleHeatChange}
                className="w-32 accent-pink-500"
              />

              {/* End Game (no deletes) */}
              <button
                onClick={() => endGame(true)}
                className="p-2 hover:bg-red-900/50 rounded-lg text-red-300 ml-4 flex items-center gap-2"
                title="סיום משחק (איפוס בלי מחיקה)"
              >
                <Trash2 size={20} />
                <span className="hidden md:inline font-bold">סיום משחק</span>
              </button>
            </div>
          </div>
        )}

        {authUser && gameState === "spinning" && (
          <div className="relative">
            <motion.div
              animate={{ rotate: 360 * 5 }}
              transition={{ duration: 3, ease: "circOut" }}
              className="w-96 h-96 rounded-full border-[12px] border-dashed border-cyan-500/30 flex items-center justify-center"
            >
              <span className="text-9xl">🎡</span>
            </motion.div>
          </div>
        )}

        {authUser && gameState === "spotlight" && selectedPlayer && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="text-center flex flex-col items-center"
          >
            <div className="w-72 h-72 rounded-full border-8 border-white shadow-[0_0_100px_white] overflow-hidden mb-8 relative">
              <img src={selectedPlayer.avatar} className="w-full h-full object-cover" />
            </div>
            <h2 className="text-8xl font-black text-white mb-4 drop-shadow-lg">
              {selectedPlayer.name}
            </h2>
            <h3 className="text-4xl font-bold text-pink-400 tracking-widest uppercase animate-pulse">
              {selectedPlayer.gender === "female" ? "תתכונני!" : "תתכונן!"}
            </h3>
          </motion.div>
        )}

        {authUser &&
          (gameState === "challenge" || gameState === "revealing") &&
          currentChallenge &&
          selectedPlayer && (
            <div className="flex flex-col items-center justify-between h-full w-full py-10">
              <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-full max-w-5xl px-4 relative z-20"
              >
                <div className="bg-gray-900/90 backdrop-blur-xl border border-white/20 p-12 rounded-[3rem] text-center shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-pink-500 to-cyan-500" />
                  <div className="flex justify-center mb-6">
                    <span
                      className={`text-4xl font-black px-6 py-2 rounded-full ${
                        challengeType === "אמת"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-pink-500/20 text-pink-400"
                      }`}
                    >
                      {challengeType}
                    </span>
                  </div>
                  <h3
                    className="text-5xl md:text-7xl font-black leading-tight mb-8 drop-shadow-lg"
                    style={{ direction: "rtl" }}
                  >
                    {currentChallenge.content}
                  </h3>

                  <div className="flex items-center gap-4 max-w-lg mx-auto bg-black/50 p-2 rounded-full">
                    <ThumbsUp className="text-green-500" />
                    <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="bg-green-500 h-full transition-all duration-300"
                        style={{
                          width: `${(votes.likes / Math.max(1, players.length - 1)) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden flex justify-end">
                      <div
                        className="bg-red-500 h-full transition-all duration-300"
                        style={{
                          width: `${(votes.dislikes / Math.max(1, players.length - 1)) * 100}%`,
                        }}
                      />
                    </div>
                    <ThumbsDown className="text-red-500" />
                  </div>

                  {currentChallenge.usedModel && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 text-[10px] text-gray-500 uppercase tracking-widest opacity-30">
                      <Cpu size={10} /> <span>{currentChallenge.usedModel}</span>
                    </div>
                  )}
                </div>
              </motion.div>

              <div className="flex justify-center gap-4 mt-8 flex-wrap px-10">
                {players
                  .filter((p) => p.id !== selectedPlayer.id)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="relative w-20 h-20 rounded-full border-2 border-white/20 opacity-70 grayscale"
                    >
                      {p.avatar.startsWith("bg-") ? (
                        <div className={`w-full h-full ${p.avatar}`} />
                      ) : (
                        <img
                          src={p.avatar}
                          className="w-full h-full object-cover rounded-full"
                        />
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

        <AnimatePresence>
          {gameState === "penalty" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2 }}
              className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-red-900/90 backdrop-blur-md overflow-hidden"
            >
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] opacity-20" />
              <motion.div
                animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
                className="mb-8"
              >
                <Beer
                  size={180}
                  className="text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.8)]"
                />
              </motion.div>

              <h1 className="text-9xl font-black uppercase mb-4 text-white drop-shadow-[0_5px_5px_rgba(0,0,0,1)] border-4 border-white p-4">
                SHOT!
              </h1>
              <h2 className="text-5xl font-bold text-red-200 mt-4">
                {selectedPlayer?.name} מוותר/ת!
              </h2>

              <div className="absolute bottom-20 w-full text-center">
                <p className="text-2xl animate-pulse text-white/70">המשחק ממשיך מיד...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {shotVoteMode && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[100] bg-orange-600 flex flex-col items-center justify-center"
            >
              <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 0.5 }}>
                <Beer size={200} className="mb-8 text-yellow-300" />
              </motion.div>
              <h1 className="text-8xl font-black text-white border-y-8 border-white py-4">כולם שותים!</h1>
              <p className="text-3xl mt-4 font-bold text-orange-200">הקהל אמר את דברו</p>
            </motion.div>
          )}
        </AnimatePresence>

        {authUser && joinUrl && (
          <div
            className={`absolute z-30 transition-all duration-500 bg-white p-2 rounded-xl shadow-2xl ${
              gameState === "lobby" || gameState === "waiting_for_spin"
                ? "bottom-20 right-10 scale-125 rotate-3 hover:rotate-0"
                : "bottom-6 right-6 scale-75 opacity-70 hover:opacity-100"
            }`}
          >
            <QRCode value={joinUrl} size={gameState === "lobby" ? 120 : 100} />
            {(gameState === "lobby" || gameState === "waiting_for_spin") && (
              <p className="text-black text-[10px] font-black text-center mt-1 uppercase tracking-widest">
                סרוק להצטרפות
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
