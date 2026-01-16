// src/hooks/useHostGameLogic.ts
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/app/lib/supabase";
import { User, RealtimeChannel } from "@supabase/supabase-js";
import confetti from "canvas-confetti";

// --- Types ---
export type Player = {
  id: string;
  created_at?: string;
  name: string;
  gender: "male" | "female" | "other";
  avatar: string;
  host_id: string;
  user_id: string;
  session_id?: string | null;
  is_active?: boolean | null;
};

export type Challenge = {
  content: string;
  spiciness: number;
  themeColor: string;
  usedModel?: string;
};

export type Reaction = { id: string; emoji: string; playerId: string; x: number };

export const useHostGameLogic = (
  playSpinSound: () => void,
  playShotSound: () => void,
  playWinSound: () => void
) => {
  // --- State ---
  const [gameState, setGameState] = useState<
    "lobby" | "waiting_for_spin" | "spinning" | "spotlight" | "revealing" | "challenge" | "penalty"
  >("lobby");
  const [players, setPlayers] = useState<Player[]>([]);
  const [heatLevel, setHeatLevel] = useState<number>(1);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [lastActivePlayer, setLastActivePlayer] = useState<Player | null>(null);
  const [challengeType, setChallengeType] = useState<"אמת" | "חובה" | null>(null);
  const [currentChallenge, setCurrentChallenge] = useState<Challenge | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");

  // Auth & Connection
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Interactive
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [votes, setVotes] = useState<{ likes: number; dislikes: number; shots: number }>({
    likes: 0,
    dislikes: 0,
    shots: 0,
  });
  const [shotVoteMode, setShotVoteMode] = useState(false);

  // --- Helpers ---
  const genSessionId = () => {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    } catch {}
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const isActiveRow = (p: any, sid: string | null) => {
    if (!sid) return false;
    // בדיקה פשוטה יותר - אם ה-session_id תואם והשחקן פעיל
    return p?.session_id === sid && p?.is_active === true;
  };

  // State Ref to avoid stale closures in listeners
  const stateRef = useRef({ players, lastActivePlayer, gameState, sessionId });
  useEffect(() => {
    stateRef.current = { players, lastActivePlayer, gameState, sessionId };
  }, [players, lastActivePlayer, gameState, sessionId]);

  // --- Sync Logic ---
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
      session_id: sid,
      status,
      current_player_id: currentPlayerId,
      last_active_player_id: activeControllerId,
      heat_level: heatLevel,
      challenge_text: challenge?.content || null,
      challenge_type: challengeType,
      updated_at: new Date().toISOString(),
    });
  };

  // Turn management
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

  // Sync state changes
  useEffect(() => {
    if (authUser && sessionId) {
      syncGameStateToDB(gameState, selectedPlayer?.id, currentChallenge);
    }
    if (gameState !== "challenge") {
      setVotes({ likes: 0, dislikes: 0, shots: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, selectedPlayer, currentChallenge, heatLevel, sessionId]);

  // URL setup
  useEffect(() => {
    if (authUser && typeof window !== "undefined") {
      setJoinUrl(`${window.location.origin}/join?hostId=${authUser.id}`);
    }
  }, [authUser]);

  // Auto votes logic
  useEffect(() => {
    if (gameState !== "challenge") return;
    const voters = Math.max(1, players.length - 1);
    if (votes.likes > voters * 0.5) handleDone();
    else if (votes.dislikes > voters * 0.5) handleSkip();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [votes, players.length, gameState]);

  // --- Realtime Setup ---
  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let gsChannel: RealtimeChannel | null = null;

    const loadOrCreateGameState = async (hostId: string) => {
      const gs = await supabase
        .from("game_states")
        .select("*")
        .eq("host_id", hostId)
        .single();

      if (gs.data?.session_id) {
        setSessionId(gs.data.session_id);
        if (gs.data.heat_level) setHeatLevel(gs.data.heat_level);
        return gs.data.session_id as string;
      }

      const created = await supabase
        .from("game_states")
        .upsert({
          host_id: hostId,
          status: "lobby",
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

      // Listen to game_states updates
      gsChannel = supabase
        .channel(`gamestate_host_${hostId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "game_states", filter: `host_id=eq.${hostId}` },
          (payload) => {
            const next = payload.new as any;
            const nextSid: string | null = next?.session_id ?? null;

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
            if (typeof next?.heat_level === "number") setHeatLevel(next.heat_level);
          }
        )
        .subscribe();

      // Listen to players - FIXED REALTIME LOGIC
      channel = supabase
        .channel(`room_${hostId}_players`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "players", filter: `host_id=eq.${hostId}` },
          (payload) => {
            const np = payload.new as any;
            const sidNow = stateRef.current.sessionId;
            
            // אנחנו מוסיפים רק אם השחקן שייך לסשן הנוכחי והוא פעיל
            if (isActiveRow(np, sidNow)) {
                 setPlayers((prev) => {
                    const exists = prev.some((p) => p.id === np.id);
                    if (exists) return prev;
                    return [...prev, np];
                 });
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "players", filter: `host_id=eq.${hostId}` },
          (payload) => {
            const up = payload.new as any;
            const sidNow = stateRef.current.sessionId;

            // אם השחקן לא פעיל או שייך לסשן אחר - הסר אותו
            if (!isActiveRow(up, sidNow)) {
              setPlayers((prev) => prev.filter((p) => p.id !== up.id));
              return;
            }

            // אחרת, עדכן או הוסף אותו
            setPlayers((prev) => {
              const exists = prev.some((p) => p.id === up.id);
              return exists ? prev.map((p) => (p.id === up.id ? up : p)) : [...prev, up];
            });
          }
        )
        // הוספתי גם האזנה למחיקה למקרה שמשהו נמחק מהדאטהבייס ידנית
         .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "players", filter: `host_id=eq.${hostId}` },
          (payload) => {
             const deletedId = (payload.old as any)?.id;
             if (deletedId) {
                setPlayers((prev) => prev.filter((p) => p.id !== deletedId));
             }
          }
        )
        .on("broadcast", { event: "game_event" }, (event) => handleGameEvent(event.payload))
        .subscribe((status) => setIsConnected(status === "SUBSCRIBED"));
    };

    const handleGameEvent = (data: any) => {
      const { type, payload, playerId } = data;
      const allowedTypes = new Set([
        "emoji", "action_skip", "vote_like", "vote_dislike", 
        "vote_shot", "trigger_spin", "update_heat", "player_left"
      ]);
      if (!allowedTypes.has(type)) return;

      const exists = stateRef.current.players.some((p) => p.id === playerId);
      // נאפשר player_left גם אם השחקן כבר לא ברשימה (למקרה קיצון)
      if (type !== "emoji" && type !== "player_left" && !exists) return;

      if (type === "emoji") {
        const id = Math.random().toString(36);
        const randomX = Math.random() * 80 + 10;
        setReactions((prev) => [...prev, { id, emoji: payload, playerId, x: randomX }]);
        setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 4000);
      }

      if (type === "update_heat") setHeatLevel(payload);
      if (type === "trigger_spin") spinTheWheel();
      if (type === "action_skip") handleSkip();
      if (type === "player_left") setPlayers((prev) => prev.filter((p) => p.id !== playerId));

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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Actions ---
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

  // Reveal logic
  useEffect(() => {
    if (gameState === "spotlight") {
      const t = setTimeout(() => setGameState("revealing"), 3000);
      return () => clearTimeout(t);
    }
  }, [gameState]);

  // AI Generation
  useEffect(() => {
    if (gameState === "revealing" && selectedPlayer && challengeType && authUser) {
      setLoadingAI(true);
      fetch("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          playerName: selectedPlayer.name,
          playerGender: selectedPlayer.gender,
          heatLevel: heatLevel,
          type: challengeType,
          previousChallenges: [],
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
    playWinSound();
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

  const endGame = async (askConfirm = true) => {
    if (!authUser) return;
    if (askConfirm && !confirm("לסיים משחק ולהתחיל חדש (0 שחקנים, בלי למחוק DB)?")) return;
    const newSid = genSessionId();
    await supabase.from("game_states").upsert({
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
    setSessionId(newSid);
    setPlayers([]);
    setGameState("lobby");
    setLastActivePlayer(null);
    setSelectedPlayer(null);
    setCurrentChallenge(null);
    setChallengeType(null);
    setHeatLevel(1);
  };

  const handleLogout = async () => {
    if (confirm("האם אתה בטוח שברצונך להתנתק?")) {
      await supabase.auth.signOut();
    }
  };

  return {
    // State
    gameState,
    players,
    heatLevel,
    selectedPlayer,
    lastActivePlayer,
    challengeType,
    currentChallenge,
    joinUrl,
    authUser,
    isConnected,
    reactions,
    votes,
    shotVoteMode,
    
    // Setters (if needed directly)
    setHeatLevel,

    // Actions
    spinTheWheel,
    handleManualRefresh,
    handleLogout,
    endGame,
  };
};