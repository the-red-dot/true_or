// src/hooks/usePlayerGameLogic.ts
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
};

export const usePlayerGameLogic = (hostId: string | null) => {
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
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameStateRow | null>(null);
  const [localHeat, setLocalHeat] = useState(1);

  // Refs
  const myPlayerIdRef = useRef<string | null>(null);
  const myUserIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const broadcastRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    myPlayerIdRef.current = myPlayerId;
  }, [myPlayerId]);

  // --- Helpers ---
  const handleKicked = (opts?: { keepInputs?: boolean }) => {
    if (hostId) localStorage.removeItem(`player_id_${hostId}`);
    setMyPlayerId(null);
    setIsSubmitted(false);
  };

  // Fixed Compression for lighter payload
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          // Reduced size significantly to ensure Realtime payload success
          const maxWidth = 150; 
          const scaleSize = maxWidth / img.width;
          canvas.width = maxWidth;
          canvas.height = img.height * scaleSize;
          const ctx = canvas.getContext("2d");
          if (ctx) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              // Reduced quality to 0.5
              resolve(canvas.toDataURL("image/jpeg", 0.5));
          } else {
              resolve(""); // Fallback
          }
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
      if (status === 'SUBSCRIBED') {
        broadcastRef.current = bc;
        console.log("Broadcast channel connected for player");
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
      // Cleanup
      if (broadcastRef.current) {
        supabase.removeChannel(broadcastRef.current);
        broadcastRef.current = null;
      }
      supabase.removeChannel(gameStateChannel);
      supabase.removeChannel(playersChannel);
    };
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
        .select("id,name,gender,avatar,is_active,session_id")
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
    if (!channel) {
        console.warn("Broadcast channel not ready yet. Retrying in 500ms...");
        // Fallback retry
        setTimeout(() => sendAction(type, payload), 500);
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

  const handleSpin = () => sendAction("trigger_spin");
  const handleHeatChange = (val: number) => {
    setLocalHeat(val);
    sendAction("update_heat", val);
  };
  const sendEmoji = (icon: string) => sendAction("emoji", icon);
  const sendVote = (type: "vote_like" | "vote_dislike" | "vote_shot" | "action_skip") => sendAction(type);

  return {
    // State
    name, setName,
    gender, setGender,
    imagePreview, handleImageUpload,
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
    sendVote
  };
};