// src/app/hooks/useHostGameLogic.ts
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/app/lib/supabase";
import { User } from "@supabase/supabase-js";
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
  is_adult?: boolean;
  max_heat_level?: number;
};

export type Challenge = {
  content: string;
  spiciness: number;
  themeColor: string;
  usedModel?: string;
};

export type Reaction = { id: string; emoji: string; playerId: string; x: number };

// עדכון טיפוס העונש כדי לכלול את כל הסוגים החדשים
export type Penalty = {
    id?: string;
    type: 'shot' | 'lemon' | 'vinegar' | 'onion' | 'garlic' | 'water' | 'ice' | 'kiss_wall' | 'squats' | 'tea_bag' | 'pasta' | 'lipstick' | 'oil' | 'chili';
    text: string;
    description?: string; 
    is18?: boolean;
};

export const useHostGameLogic = (
  playSpinSound: () => void,
  playShotSound: () => void,
  playWinSound: () => void
) => {
  // --- State ---
  const [gameState, setGameState] = useState<
    "lobby" | "waiting_for_spin" | "spinning" | "spotlight" | "waiting_for_choice" | "revealing" | "challenge" | "choosing_penalty" | "penalty"
  >("lobby");
  const [players, setPlayers] = useState<Player[]>([]);
  const [heatLevel, setHeatLevel] = useState<number>(1);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [lastActivePlayer, setLastActivePlayer] = useState<Player | null>(null);
  const [challengeType, setChallengeType] = useState<"אמת" | "חובה" | null>(null);
  const [currentChallenge, setCurrentChallenge] = useState<Challenge | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");

  const [currentPenalty, setCurrentPenalty] = useState<Penalty | null>(null);
  const [previewPenalty, setPreviewPenalty] = useState<Penalty | null>(null);

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

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

  const resetVotes = () => {
    setVotes({ likes: 0, dislikes: 0, shots: 0 });
    setShotVoteMode(false);
  };

  const roundEndLockRef = useRef(false);

  const stateRef = useRef({
    players,
    lastActivePlayer,
    gameState,
    sessionId,
    selectedPlayer,
    shotVoteMode,
    heatLevel,
    challengeType,
    currentChallenge,
    authUser,
  });

  useEffect(() => {
    stateRef.current = {
      players,
      lastActivePlayer,
      gameState,
      sessionId,
      selectedPlayer,
      shotVoteMode,
      heatLevel,
      challengeType,
      currentChallenge,
      authUser,
    };
  }, [
    players,
    lastActivePlayer,
    gameState,
    sessionId,
    selectedPlayer,
    shotVoteMode,
    heatLevel,
    challengeType,
    currentChallenge,
    authUser,
  ]);

  const syncGameStateToDB = async (args: {
    status: string;
    currentPlayerId: string | null;
    controllerId: string | null;
    heat: number;
    sid: string | null;
    challengeText: string | null;
    challengeT: "אמת" | "חובה" | null;
  }) => {
    const au = stateRef.current.authUser;
    if (!au) return;

    await supabase.from("game_states").upsert({
      host_id: au.id,
      session_id: args.sid,
      status: args.status,
      current_player_id: args.currentPlayerId,
      last_active_player_id: args.controllerId,
      heat_level: args.heat,
      challenge_text: args.challengeText,
      challenge_type: args.challengeT,
      updated_at: new Date().toISOString(),
    });
  };

  const ensureController = (list: Player[]) => {
    const gs = stateRef.current.gameState;
    const sid = stateRef.current.sessionId;
    const au = stateRef.current.authUser;
    if (!au || !sid) return;
    if (gs !== "lobby" && gs !== "waiting_for_spin") return;
    if (list.length === 0) return;

    const current = stateRef.current.lastActivePlayer;
    const stillExists = current && list.some((p) => p.id === current.id);
    const controller = stillExists ? current! : list[0];

    if (!stillExists) setLastActivePlayer(controller);

    void syncGameStateToDB({
      status: gs,
      currentPlayerId: stateRef.current.selectedPlayer?.id ?? null,
      controllerId: controller.id,
      heat: stateRef.current.heatLevel,
      sid,
      challengeText: stateRef.current.currentChallenge?.content ?? null,
      challengeT: stateRef.current.challengeType,
    });
  };

  useEffect(() => {
    const initAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
        resetVotes();
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authUser) return;

    const loadGame = async () => {
      const gs = await supabase.from("game_states").select("*").eq("host_id", authUser.id).single();

      let currentSid: string | null = null;

      if (gs.data?.session_id) {
        const data = gs.data;
        currentSid = data.session_id;
        setSessionId(currentSid);
        if (typeof data.heat_level === "number") setHeatLevel(data.heat_level);
        if (data.status) setGameState(data.status as any);
        if (data.challenge_type) setChallengeType(data.challenge_type as any);
        if (data.challenge_text)
          setCurrentChallenge({
            content: data.challenge_text,
            spiciness: data.heat_level,
            themeColor: "",
            usedModel: "Restored",
          });
      } else {
        currentSid = genSessionId();
        await supabase.from("game_states").upsert({
          host_id: authUser.id,
          status: "lobby",
          heat_level: 1,
          session_id: currentSid,
          updated_at: new Date().toISOString(),
        });
        setSessionId(currentSid);
      }

      if (currentSid) {
        const { data: loadedPlayers } = await supabase
          .from("players")
          .select("*")
          .eq("host_id", authUser.id)
          .eq("session_id", currentSid)
          .eq("is_active", true)
          .order("created_at", { ascending: true });

        if (loadedPlayers) {
          const list = loadedPlayers as Player[];
          setPlayers(list);

          if (gs.data) {
            if (gs.data.current_player_id) {
              const selected = list.find((p) => p.id === gs.data.current_player_id);
              if (selected) setSelectedPlayer(selected);
            }
            if (gs.data.last_active_player_id) {
              const active = list.find((p) => p.id === gs.data.last_active_player_id);
              if (active) setLastActivePlayer(active);
              else if (list.length > 0) setLastActivePlayer(list[0]);
            } else if (list.length > 0) {
              setLastActivePlayer(list[0]);
            }
          } else if (list.length > 0) {
            setLastActivePlayer(list[0]);
          }

          ensureController(list);
        }
      }
    };

    loadGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]);

  const handleManualRefresh = async () => {
    const au = stateRef.current.authUser;
    const sid = stateRef.current.sessionId;
    if (!au || !sid) return;

    const { data } = await supabase
      .from("players")
      .select("*")
      .eq("host_id", au.id)
      .eq("session_id", sid)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (data) {
      setPlayers(data as Player[]);
      ensureController(data as Player[]);
    }
  };

  const triggerGroupShot = () => {
    if (roundEndLockRef.current) return;
    roundEndLockRef.current = true;

    setShotVoteMode(true);
    playShotSound();

    setTimeout(() => {
      setShotVoteMode(false);
      setGameState("waiting_for_spin");
      setSelectedPlayer(null);
    }, 5000);
  };

  const handleDone = () => {
    if (roundEndLockRef.current) return;
    roundEndLockRef.current = true;

    confetti({ particleCount: 200, spread: 120 });
    playWinSound();

    const sp = stateRef.current.selectedPlayer;
    setLastActivePlayer(sp ?? null);

    setTimeout(() => {
      setGameState("waiting_for_spin");
      setSelectedPlayer(null);
    }, 3000);
  };

  const handleSkip = () => {
    if (roundEndLockRef.current) return;
    setGameState("choosing_penalty");
    setPreviewPenalty(null); 
  };

  const executePenalty = (penalty: Penalty) => {
      if (roundEndLockRef.current) return;
      roundEndLockRef.current = true;

      setCurrentPenalty(penalty);
      setGameState("penalty");
      playShotSound();

      setTimeout(() => {
        const sp = stateRef.current.selectedPlayer;
        setLastActivePlayer(sp ?? null);
        setGameState("waiting_for_spin");
        setSelectedPlayer(null);
        setCurrentPenalty(null);
        setPreviewPenalty(null);
      }, 6000);
  };

  const spinTheWheel = () => {
    const { players: currentPlayers, gameState: gs, lastActivePlayer: controller } = stateRef.current;

    if (currentPlayers.length < 2) {
      void handleManualRefresh();
      if (stateRef.current.players.length < 2) return alert("צריך לפחות 2 שחקנים כדי להתחיל!");
    }

    if (gs !== "lobby" && gs !== "waiting_for_spin") return;

    roundEndLockRef.current = false;
    resetVotes();

    setChallengeType(null);
    setGameState("spinning");
    playSpinSound();

    setTimeout(() => {
      const freshPlayers = stateRef.current.players;
      if (freshPlayers.length === 0) return setGameState("lobby");

      // --- LOGIC CHANGE: Filter out the current controller ---
      // השחקן שמחזיק בשרביט לא יכול להיבחר
      let candidates = freshPlayers;
      if (controller) {
          candidates = freshPlayers.filter(p => p.id !== controller.id);
      }
      
      // Fallback: If only 1 player total (testing) or error, fallback to any player
      if (candidates.length === 0) candidates = freshPlayers;

      const randomPlayer = candidates[Math.floor(Math.random() * candidates.length)];
      setSelectedPlayer(randomPlayer);
      setGameState("spotlight");
    }, 3000);
  };

  const handleGameEvent = (data: any) => {
    const { type, payload, playerId } = data;
    const gs = stateRef.current.gameState;

    if (type === "emoji") {
      const id = Math.random().toString(36);
      const randomX = Math.random() * 80 + 10;
      setReactions((prev) => [...prev, { id, emoji: payload, playerId, x: randomX }]);
      setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 4000);
      return;
    }

    if (type === "update_heat") {
      setHeatLevel(payload);
      return;
    }

    if (type === "trigger_spin") {
      spinTheWheel();
      return;
    }

    if (type === "player_left") {
      setPlayers((prev) => {
        const next = prev.filter((p) => p.id !== playerId);
        ensureController(next);
        return next;
      });
      return;
    }

    if (type === "player_choice") {
        if (gs === "waiting_for_choice" && playerId === stateRef.current.selectedPlayer?.id) {
            setChallengeType(payload as "אמת" | "חובה");
            setGameState("revealing");
        }
        return;
    }

    if (gs === "choosing_penalty") {
        if (type === "penalty_preview") {
            setPreviewPenalty(payload); 
            return;
        }
        if (type === "penalty_selected") {
            executePenalty(payload);
            return;
        }
    }

    if (gs !== "challenge") return;

    if (type === "action_skip") {
      handleSkip();
      return;
    }

    if (type === "vote_like") {
      setVotes((v) => ({ ...v, likes: v.likes + 1 }));
      return;
    }

    if (type === "vote_dislike") {
      setVotes((v) => ({ ...v, dislikes: v.dislikes + 1 }));
      return;
    }

    if (type === "vote_shot") {
      setVotes((v) => {
        const newShots = v.shots + 1;
        const threshold = Math.max(2, Math.floor(stateRef.current.players.length / 2));
        if (newShots >= threshold && !stateRef.current.shotVoteMode) triggerGroupShot();
        return { ...v, shots: newShots };
      });
      return;
    }
  };

  useEffect(() => {
    if (!authUser || !sessionId) return;

    const hostId = authUser.id;

    const gsChannel = supabase
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
            resetVotes();
            return;
          }

          if (next.status) setGameState(next.status);
          if (typeof next.heat_level === "number") setHeatLevel(next.heat_level);

          if (next.current_player_id) {
            const p = stateRef.current.players.find((p) => p.id === next.current_player_id);
            if (p && p.id !== stateRef.current.selectedPlayer?.id) setSelectedPlayer(p);
          }
          if (next.last_active_player_id) {
            const lp = stateRef.current.players.find((p) => p.id === next.last_active_player_id);
            if (lp && lp.id !== stateRef.current.lastActivePlayer?.id) setLastActivePlayer(lp);
          }
        }
      )
      .subscribe();

    const roomChannel = supabase
      .channel(`room_${hostId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "players", filter: `host_id=eq.${hostId}` },
        (payload) => {
          const np = payload.new as any;
          const sidNow = stateRef.current.sessionId;

          if (np.session_id === sidNow && np.is_active) {
            setPlayers((prev) => {
              const next = prev.some((p) => p.id === np.id) ? prev : [...prev, np];
              ensureController(next);
              return next;
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

          setPlayers((prev) => {
            let next: Player[];
            if (up.session_id !== sidNow || !up.is_active) {
              next = prev.filter((p) => p.id !== up.id);
            } else {
              const exists = prev.some((p) => p.id === up.id);
              next = exists ? prev.map((p) => (p.id === up.id ? up : p)) : [...prev, up];
            }
            ensureController(next);
            return next;
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "players", filter: `host_id=eq.${hostId}` },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (!deletedId) return;
          setPlayers((prev) => {
            const next = prev.filter((p) => p.id !== deletedId);
            ensureController(next);
            return next;
          });
        }
      )
      .on("broadcast", { event: "game_event" }, (event) => handleGameEvent(event.payload))
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(gsChannel);
      supabase.removeChannel(roomChannel);
    };
  }, [authUser, sessionId]);

  useEffect(() => {
    if (!authUser || !sessionId) return;

    const controllerId =
      lastActivePlayer?.id ?? (players.length > 0 ? players[0].id : null);

    const t = setTimeout(() => {
      void syncGameStateToDB({
        status: gameState,
        currentPlayerId: selectedPlayer?.id ?? null,
        controllerId,
        heat: heatLevel,
        sid: sessionId,
        challengeText: currentChallenge?.content ?? null,
        challengeT: challengeType,
      });
    }, 120);

    return () => clearTimeout(t);
  }, [
    authUser,
    sessionId,
    gameState,
    selectedPlayer?.id,
    lastActivePlayer?.id,
    players.length,
    heatLevel,
    challengeType,
    currentChallenge?.content,
  ]);

  useEffect(() => {
    if (gameState !== "challenge") {
      resetVotes();
    } else {
      roundEndLockRef.current = false;
      resetVotes();
    }
  }, [gameState, sessionId]);

  useEffect(() => {
    if (authUser && typeof window !== "undefined") {
      setJoinUrl(`${window.location.origin}/join?hostId=${authUser.id}`);
    }
  }, [authUser]);

  useEffect(() => {
    if (gameState !== "challenge") return;
    if (roundEndLockRef.current) return;

    const voters = Math.max(1, players.length - 1);
    if (votes.likes > voters * 0.5) handleDone();
    else if (votes.dislikes > voters * 0.5) handleSkip();
  }, [votes, players.length, gameState]);

  useEffect(() => {
    if (gameState === "spotlight") {
      const t = setTimeout(() => setGameState("waiting_for_choice"), 3000);
      return () => clearTimeout(t);
    }
  }, [gameState]);

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
          setHeatLevel(data.spiciness); 
          setGameState("challenge");
        })
        .catch((err) => {
          console.error(err);
          setGameState("challenge");
        })
        .finally(() => setLoadingAI(false));
    }
  }, [gameState, authUser, selectedPlayer, challengeType, players, heatLevel]);

  const endGame = async (askConfirm = true) => {
    const au = stateRef.current.authUser;
    if (!au) return;
    if (askConfirm && !confirm("לסיים משחק ולהתחיל חדש?")) return;

    await supabase.from("players").delete().eq("host_id", au.id);

    const newSid = genSessionId();

    await supabase.from("game_states").upsert({
      host_id: au.id,
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
    resetVotes();
    setCurrentPenalty(null);
    setPreviewPenalty(null);
    roundEndLockRef.current = false;
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
    currentPenalty,
    previewPenalty,
    setHeatLevel,
    spinTheWheel,
    handleManualRefresh,
    handleLogout,
    endGame,
  };
};