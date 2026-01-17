// src/app/hooks/useHostGameLogic.ts

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
  const [isConnected, setIsConnected] = useState<boolean>(false);
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
    return p?.session_id === sid && p?.is_active === true;
  };

  // State Ref - Critical for Realtime Callbacks
  const stateRef = useRef({ players, lastActivePlayer, gameState, sessionId, selectedPlayer, shotVoteMode });
  
  useEffect(() => {
    stateRef.current = { players, lastActivePlayer, gameState, sessionId, selectedPlayer, shotVoteMode };
  }, [players, lastActivePlayer, gameState, sessionId, selectedPlayer, shotVoteMode]);

  // --- 1. Auth Initialization ---
  useEffect(() => {
    const initAuth = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) setAuthUser(user);
    };
    initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setAuthUser(session.user);
      } else {
        setAuthUser(null);
        setPlayers([]);
        setSessionId(null);
        setJoinUrl("");
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // --- 2. Load Game Session Data ---
  useEffect(() => {
    if (!authUser) return;

    const loadGame = async () => {
        // Fetch existing game state
        const gs = await supabase
            .from("game_states")
            .select("*")
            .eq("host_id", authUser.id)
            .single();

        let currentSid = null;

        if (gs.data?.session_id) {
            // Restore existing
            const data = gs.data;
            currentSid = data.session_id;
            setSessionId(currentSid);
            if (data.heat_level) setHeatLevel(data.heat_level);
            if (data.status) setGameState(data.status as any);
            if (data.challenge_type) setChallengeType(data.challenge_type as any);
            if (data.challenge_text) setCurrentChallenge({ content: data.challenge_text, spiciness: data.heat_level, themeColor: "", usedModel: "Restored" });
        } else {
            // Create new
            currentSid = genSessionId();
            await supabase
                .from("game_states")
                .upsert({
                    host_id: authUser.id,
                    status: "lobby",
                    heat_level: 1,
                    session_id: currentSid,
                    updated_at: new Date().toISOString(),
                });
            setSessionId(currentSid);
        }

        // Load players for this session
        if (currentSid) {
             const { data: loadedPlayers } = await supabase
                .from("players")
                .select("*")
                .eq("host_id", authUser.id)
                .eq("session_id", currentSid)
                .eq("is_active", true)
                .order("created_at", { ascending: true });

             if (loadedPlayers) {
                 setPlayers(loadedPlayers as Player[]);
                 
                 // Restore context if needed
                 if (gs.data) {
                    if (gs.data.current_player_id) {
                        const selected = (loadedPlayers as Player[]).find(p => p.id === gs.data.current_player_id);
                        if (selected) setSelectedPlayer(selected);
                    }
                    if (gs.data.last_active_player_id) {
                        const active = (loadedPlayers as Player[]).find(p => p.id === gs.data.last_active_player_id);
                        if (active) setLastActivePlayer(active);
                        else if (loadedPlayers.length > 0) setLastActivePlayer(loadedPlayers[0] as Player);
                    } else if (loadedPlayers.length > 0) {
                        setLastActivePlayer(loadedPlayers[0] as Player);
                    }
                 }
             }
        }
    };

    loadGame();
  }, [authUser]);

  // --- 3. Realtime Subscriptions (Starts ONLY after SessionID is ready) ---
  useEffect(() => {
    if (!authUser || !sessionId) return;

    const hostId = authUser.id;

    // A. Game State Channel (Sync Only)
    const gsChannel = supabase
        .channel(`gamestate_host_${hostId}`)
        .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "game_states", filter: `host_id=eq.${hostId}` },
            (payload) => {
                const next = payload.new as any;
                const nextSid: string | null = next?.session_id ?? null;

                if (nextSid && nextSid !== stateRef.current.sessionId) {
                    // Session changed remotely
                    setSessionId(nextSid);
                    setPlayers([]);
                    setGameState("lobby");
                    return;
                }
                
                if (next.status) setGameState(next.status);
                if (typeof next.heat_level === "number") setHeatLevel(next.heat_level);
                if (next.current_player_id) {
                    const p = stateRef.current.players.find(p => p.id === next.current_player_id);
                    if (p && p.id !== stateRef.current.selectedPlayer?.id) {
                        setSelectedPlayer(p);
                    }
                }
            }
        )
        .subscribe();

    // B. Room Channel (Players + Broadcasts)
    const roomChannel = supabase
        .channel(`room_${hostId}`)
        .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "players", filter: `host_id=eq.${hostId}` },
            (payload) => {
                const np = payload.new as any;
                const sidNow = stateRef.current.sessionId;
                
                // IMPORTANT: Use the sessionId from Ref to ensure we match the current loaded session
                if (np.session_id === sidNow && np.is_active) {
                    setPlayers((prev) => {
                        if (prev.some(p => p.id === np.id)) return prev;
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
                
                if (up.session_id !== sidNow || !up.is_active) {
                    setPlayers((prev) => prev.filter((p) => p.id !== up.id));
                    return;
                }

                setPlayers((prev) => {
                    const exists = prev.some((p) => p.id === up.id);
                    return exists ? prev.map((p) => (p.id === up.id ? up : p)) : [...prev, up];
                });
            }
        )
        .on(
            "postgres_changes",
            { event: "DELETE", schema: "public", table: "players", filter: `host_id=eq.${hostId}` },
            (payload) => {
                const deletedId = (payload.old as any)?.id;
                if (deletedId) setPlayers((prev) => prev.filter((p) => p.id !== deletedId));
            }
        )
        .on("broadcast", { event: "game_event" }, (event) => handleGameEvent(event.payload))
        .subscribe((status) => {
            console.log("Realtime connection status:", status);
            setIsConnected(status === "SUBSCRIBED");
        });

    return () => {
        console.log("Cleaning up channels");
        supabase.removeChannel(gsChannel);
        supabase.removeChannel(roomChannel);
    };
  }, [authUser, sessionId]); // Re-subscribe if auth or session changes

  // --- Handlers ---

  const handleGameEvent = (data: any) => {
      const { type, payload, playerId } = data;
      
      if (type === "emoji") {
        const id = Math.random().toString(36);
        const randomX = Math.random() * 80 + 10;
        setReactions((prev) => [...prev, { id, emoji: payload, playerId, x: randomX }]);
        setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 4000);
      }
      
      if (type === "update_heat") setHeatLevel(payload);
      if (type === "trigger_spin") spinTheWheel();
      if (type === "action_skip") handleSkip();
      
      if (type === "player_left") {
          setPlayers((prev) => prev.filter((p) => p.id !== playerId));
      }

      if (type === "vote_like") setVotes((v) => ({ ...v, likes: v.likes + 1 }));
      if (type === "vote_dislike") setVotes((v) => ({ ...v, dislikes: v.dislikes + 1 }));
      
      if (type === "vote_shot") {
        setVotes((v) => {
          const newShots = v.shots + 1;
          const threshold = Math.max(2, Math.floor(stateRef.current.players.length / 2));
          if (newShots >= threshold && !stateRef.current.shotVoteMode) triggerGroupShot(); 
          return { ...v, shots: newShots };
        });
      }
  };

  // --- Sync Game State (Debounced) ---
  const syncGameStateToDB = async (
    status: string,
    currentPlayerId: string | null = null,
    challenge: any = null,
    forceControllerId: string | undefined | null = undefined
  ) => {
    if (!authUser) return;

    let activeControllerId =
      forceControllerId !== undefined ? forceControllerId : lastActivePlayer?.id;

    if (!activeControllerId && stateRef.current.players.length > 0) {
      activeControllerId = stateRef.current.players[0].id;
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

  useEffect(() => {
    if (authUser && sessionId) {
      const t = setTimeout(() => {
          syncGameStateToDB(gameState, selectedPlayer?.id, currentChallenge);
      }, 100);
      return () => clearTimeout(t);
    }
    if (gameState !== "challenge") {
      setVotes({ likes: 0, dislikes: 0, shots: 0 });
    }
  }, [gameState, selectedPlayer, currentChallenge, heatLevel, sessionId]);

  // URL setup
  useEffect(() => {
    if (authUser && typeof window !== "undefined") {
      setJoinUrl(`${window.location.origin}/join?hostId=${authUser.id}`);
    }
  }, [authUser]);

  // Auto votes
  useEffect(() => {
    if (gameState !== "challenge") return;
    const voters = Math.max(1, players.length - 1);
    if (votes.likes > voters * 0.5) handleDone();
    else if (votes.dislikes > voters * 0.5) handleSkip();
  }, [votes, players.length, gameState]);

  // --- Actions ---

  const spinTheWheel = () => {
    const currentPlayers = stateRef.current.players;
    
    if (currentPlayers.length < 2) {
        handleManualRefresh();
        if (currentPlayers.length < 2) return alert("צריך לפחות 2 שחקנים כדי להתחיל!");
    }

    if (gameState !== 'lobby' && gameState !== 'waiting_for_spin') {
        return;
    }

    setGameState("spinning");
    playSpinSound();

    setTimeout(() => {
      const freshPlayers = stateRef.current.players;
      if (freshPlayers.length === 0) return setGameState("lobby");

      const randomPlayer = freshPlayers[Math.floor(Math.random() * freshPlayers.length)];
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

  // AI Generation
  useEffect(() => {
    if (gameState === "revealing" && selectedPlayer && challengeType && authUser) {
      setLoadingAI(true);
      fetch("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          playerName: selectedPlayer.name,
          playerGender: selectedPlayer.gender,
          players: players,
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
        .catch((err) => {
            console.error(err);
            setGameState("challenge");
        })
        .finally(() => setLoadingAI(false));
    }
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
    if (!authUser || !sessionId) return;
    const { data } = await supabase
      .from("players")
      .select("*")
      .eq("host_id", authUser.id)
      .eq("session_id", sessionId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (data) {
      console.log("Manual Refresh Data:", data);
      setPlayers(data as Player[]);
      if (!lastActivePlayer && data.length > 0) setLastActivePlayer(data[0] as Player);
    }
  };

  const endGame = async (askConfirm = true) => {
    if (!authUser) return;
    if (askConfirm && !confirm("לסיים משחק ולהתחיל חדש?")) return;

    // Hard reset: Delete players
    await supabase.from("players").delete().eq("host_id", authUser.id);

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
    setVotes({ likes: 0, dislikes: 0, shots: 0 });
  };

  const handleLogout = async () => {
    if (confirm("להתנתק?")) await supabase.auth.signOut();
  };

  return {
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
    setHeatLevel,
    spinTheWheel,
    handleManualRefresh,
    handleLogout,
    endGame,
  };
};