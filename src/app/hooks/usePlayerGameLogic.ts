// src/app/hooks/usePlayerGameLogic.ts
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/app/lib/supabase";
import { RealtimeChannel, User } from "@supabase/supabase-js";

// --- Types ---
export type GameStateRow = {
  host_id: string;
  status: string | null;
  current_player_id: string | null;
  last_active_player_id: string | null;
  heat_level: number | null;
  challenge_text: string | null;
  challenge_type: string | null;
  session_id: string | null;
};

export type PlayerRow = {
  id: string;
  host_id: string;
  user_id: string;
  name: string;
  gender: "male" | "female" | "other";
  avatar: string;
  is_active: boolean | null;
  session_id: string | null;
  // New safety fields
  is_adult: boolean;
  max_heat_level: number;
};

// רשימת עונשים לשימוש בקונטרולר
export const PENALTIES_LIST = [
    { type: 'shot', text: 'שוט של משקה חריף!' },
    { type: 'water', text: 'שפוך על עצמך כוס מים' },
    { type: 'lemon', text: 'אכול פרוסת לימון בשלמותה' },
    { type: 'ice', text: 'קוביות קרח בחולצה' },
    { type: 'vinegar', text: 'שוט של חומץ!' },
    { type: 'onion', text: 'ביס בבצל חי' },
    { type: 'garlic', text: 'אכול שן שום טרייה' }
];

export const usePlayerGameLogic = (hostId: string | null) => {
  // Registration State
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other" | "">("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  // Safety Settings
  const [isAdult, setIsAdult] = useState(false);
  // ברירת מחדל: 2 (נועז) לקטינים, 3 (לוהט) לבוגרים
  const [personalMaxHeat, setPersonalMaxHeat] = useState(2); 

  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  // Auth / status
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Game Logic State
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameStateRow | null>(null);
  const [localHeat, setLocalHeat] = useState(1);

  // Refs
  const myPlayerIdRef = useRef<string | null>(null);
  const myUserIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const broadcastRef = useRef<RealtimeChannel | null>(null);

  // Prevent "ghost taps"/multi-send when channel isn't ready yet
  const pendingActionRef = useRef<{ type: string; payload: any } | null>(null);

  // Small UX guards (do not affect responsiveness)
  const heatDebounceRef = useRef<number | null>(null);
  const spinLockRef = useRef(false);
  const voteLockRef = useRef(false);

  useEffect(() => {
    myPlayerIdRef.current = myPlayerId;
  }, [myPlayerId]);

  // Adjust personal max heat when adult status changes
  useEffect(() => {
    // If user is not adult, force max heat to 2 (Bold)
    if (!isAdult && personalMaxHeat > 2) {
      setPersonalMaxHeat(2);
    }
    // If becomes adult, default to 3 if it was lower? Not necessarily, user choice.
    // But setting default on init:
    if (isAdult && personalMaxHeat === 2) {
       // Optional: Auto bump to 3? Let's leave it to user choice.
    }
  }, [isAdult, personalMaxHeat]);

  // --- Helpers ---
  const handleKicked = (opts?: { keepInputs?: boolean }) => {
    if (hostId) localStorage.removeItem(`player_id_${hostId}`);

    // Clear pending/locks so nothing "fires later"
    pendingActionRef.current = null;
    spinLockRef.current = false;
    voteLockRef.current = false;
    if (heatDebounceRef.current) {
      window.clearTimeout(heatDebounceRef.current);
      heatDebounceRef.current = null;
    }

    setMyPlayerId(null);
    setIsSubmitted(false);
  };

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

  // --- Effects ---

  // 1. Auth
  useEffect(() => {
    if (!hostId) return;
    (async () => {
      try {
        const { data: s0 } = await supabase.auth.getSession();
        if (!s0.session) await supabase.auth.signInAnonymously();
        const { data: u } = await supabase.auth.getUser();
        setAuthUser(u.user ?? null);
        myUserIdRef.current = u.user?.id ?? null;
      } catch (e) {
        console.error("Auth failed:", e);
      } finally {
        setAuthReady(true);
      }
    })();
  }, [hostId]);

  // 2. Load Initial Game State
  useEffect(() => {
    if (!hostId) return;
    supabase
      .from("game_states")
      .select("*")
      .eq("host_id", hostId)
      .single()
      .then(({ data, error }) => {
        if (error) {
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

  // 3. Realtime Listeners (Unified)
  useEffect(() => {
    if (!hostId) return;

    // We create one broadcast channel for interactions
    const bc = supabase.channel(`room_${hostId}`, {
      config: {
        broadcast: { self: false },
      },
    });

    bc.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        broadcastRef.current = bc;
        console.log("Broadcast channel connected for player");

        // Flush only the latest pending action (prevents stacked "auto clicks")
        const pending = pendingActionRef.current;
        if (pending) {
          pendingActionRef.current = null;
          // fire once, now that the channel is ready
          void sendAction(pending.type, pending.payload);
        }
      }
    });

    // Separate channels for DB changes to avoid filter conflicts
    const gameStateChannel = supabase
      .channel(`gamestate_listener_${hostId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_states", filter: `host_id=eq.${hostId}` },
        (payload) => {
          const next = payload.new as GameStateRow;
          setGameState(next);
          setLocalHeat(next.heat_level ?? 1);

          const nextSession = next.session_id ?? null;
          if (nextSession && nextSession !== sessionIdRef.current) {
            sessionIdRef.current = nextSession;
            if (myPlayerIdRef.current) handleKicked({ keepInputs: true });
          }

          // Optional: unlock vote on new challenge text / leaving challenge state
          // This is a lightweight guard against duplicate vote sends on mobile.
          if (next.status !== "challenge") {
            voteLockRef.current = false;
          }
        }
      )
      .subscribe();

    const playersChannel = supabase
      .channel(`players_listener_${hostId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "players", filter: `host_id=eq.${hostId}` },
        (payload) => {
          const next = payload.new as PlayerRow;
          const myUid = myUserIdRef.current;
          if (!myUid) return;
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
          const deletedId = (payload.old as any)?.id;
          if (deletedId && deletedId === myPlayerIdRef.current) handleKicked({ keepInputs: true });
        }
      )
      .subscribe();

    return () => {
      // Cleanup timers
      if (heatDebounceRef.current) {
        window.clearTimeout(heatDebounceRef.current);
        heatDebounceRef.current = null;
      }

      // Cleanup channels
      supabase.removeChannel(bc);
      broadcastRef.current = null;
      supabase.removeChannel(gameStateChannel);
      supabase.removeChannel(playersChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId]);

  // 4. Restore Session
  useEffect(() => {
    if (!hostId || !authReady) return;
    const myUid = myUserIdRef.current;
    const sessionId = sessionIdRef.current;
    if (!myUid || !sessionId) return;

    (async () => {
      const { data } = await supabase
        .from("players")
        .select("id,name,gender,avatar,is_active,session_id,is_adult,max_heat_level")
        .eq("host_id", hostId)
        .eq("user_id", myUid)
        .eq("session_id", sessionId)
        .maybeSingle();

      if (data && (data as any).is_active !== false) {
        const p = data as PlayerRow;
        setMyPlayerId(p.id);
        setIsSubmitted(true);
        setName(p.name);
        setGender(p.gender);
        setImagePreview(p.avatar);
        // Restore safety settings
        setIsAdult(p.is_adult);
        setPersonalMaxHeat(p.max_heat_level);
      }
    })();
  }, [hostId, authReady, gameState?.session_id]);

  // --- Actions ---
  const sendAction = async (type: string, payload: any = {}) => {
    if (!hostId || !myPlayerIdRef.current) {
      console.warn("Cannot send action: Missing hostId or playerId");
      return;
    }

    const channel = broadcastRef.current;

    // If channel isn't ready, store only the latest action (no recursive retries!)
    if (!channel) {
      pendingActionRef.current = { type, payload };
      return;
    }

    try {
      await channel.send({
        type: "broadcast",
        event: "game_event",
        payload: { type, payload, playerId: myPlayerIdRef.current },
      });
    } catch (err) {
      console.error("Error sending action:", err);
    }
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
    if (!sessionId) return alert("החדר לא מוכן עדיין. המתן שהמארח יתחבר.");

    setLoading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) throw new Error("No user");

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
              // Save safety settings to DB
              is_adult: isAdult,
              max_heat_level: personalMaxHeat
            },
          ],
          { onConflict: "host_id,user_id" }
        )
        .select("id")
        .single();

      if (error) throw error;

      setMyPlayerId(data.id);
      setIsSubmitted(true);
    } catch (e: any) {
      console.error(e);
      alert("שגיאה בהצטרפות");
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveGame = async () => {
    if (!confirm("לצאת מהמשחק?")) return;
    const pid = myPlayerIdRef.current;
    const myUid = myUserIdRef.current;
    if (!pid || !myUid) return;

    await sendAction("player_left");
    await supabase.from("players").update({ is_active: false }).eq("id", pid).eq("user_id", myUid);
    handleKicked({ keepInputs: true });
  };

  const handleSpin = () => {
    if (spinLockRef.current) return;
    spinLockRef.current = true;

    void sendAction("trigger_spin");

    // short lock to prevent double-tap / accidental multi-send
    window.setTimeout(() => {
      spinLockRef.current = false;
    }, 800);
  };

  const handleHeatChange = (val: number) => {
    // Check safety cap: User cannot set game heat higher than their own allowed limit
    const allowedMax = personalMaxHeat; 
    let finalVal = val;

    if (finalVal > allowedMax) {
        finalVal = allowedMax;
    }
    
    setLocalHeat(finalVal);

    // Debounce to reduce spam + prevent weird queued events
    if (heatDebounceRef.current) window.clearTimeout(heatDebounceRef.current);
    heatDebounceRef.current = window.setTimeout(() => {
      void sendAction("update_heat", finalVal);
    }, 120);
  };

  const sendEmoji = (icon: string) => {
    void sendAction("emoji", icon);
  };

  const sendVote = (type: "vote_like" | "vote_dislike" | "vote_shot" | "action_skip") => {
    // lightweight guard against rapid double taps
    if (voteLockRef.current) return;
    voteLockRef.current = true;

    void sendAction(type);

    window.setTimeout(() => {
      voteLockRef.current = false;
    }, 600);
  };

  // New function to send the player's choice
  const sendChoice = (choice: "אמת" | "חובה") => {
    void sendAction("player_choice", choice);
  };

  // Penalty Actions
  const sendPenaltyPreview = (penalty: any) => {
      void sendAction("penalty_preview", penalty);
  };

  const sendPenaltySelection = (penalty: any) => {
      void sendAction("penalty_selected", penalty);
  };

  return {
    // State
    name,
    setName,
    gender,
    setGender,
    imagePreview,
    handleImageUpload,
    
    // Safety
    isAdult,
    setIsAdult,
    personalMaxHeat,
    setPersonalMaxHeat,

    isSubmitted,
    loading,
    authReady,
    authUser,
    gameState,
    localHeat,
    myPlayerId,

    // Actions
    handleJoin,
    handleLeaveGame,
    handleSpin,
    handleHeatChange,
    sendEmoji,
    sendVote,
    sendChoice,
    sendPenaltyPreview,
    sendPenaltySelection
  };
};