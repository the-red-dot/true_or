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
  gender: "male" | "female"; 
  avatar: string;
  is_active: boolean | null;
  session_id: string | null;
  is_adult: boolean;
  max_heat_level: number;
};

// --- UPDATED PENALTIES LIST WITH GENDER SUPPORT ---
export const PENALTIES_LIST = [
    { 
        type: 'shot', 
        is18: true,
        gendered: {
            male: { text: 'שוט אלכוהול', description: "יאללה להרים! רק אם אתה חוקי, כן?" },
            female: { text: 'שוט אלכוהול', description: "יאללה להרים! רק אם את חוקית, כן?" }
        }
    },
    { 
        type: 'lemon', 
        gendered: {
            male: { text: 'שוט של מיץ לימון', description: "פרצוף חמוץ זה הכי יפה לך." },
            female: { text: 'שוט של מיץ לימון', description: "פרצוף חמוץ זה הכי יפה לך." }
        }
    },
    { 
        type: 'kiss_wall', 
        gendered: {
            male: { text: '5 נשיקות לקיר', description: "תפגין אהבה לקיר, הוא מקשיב להכל." },
            female: { text: '5 נשיקות לקיר', description: "תפגיני אהבה לקיר, הוא מקשיב להכל." }
        }
    },
    { 
        type: 'squats', 
        gendered: {
            male: { text: '20 סקוואטים', description: "תוריד את הטוסיק נמוך, שלא ייתפס לך הגב." },
            female: { text: '20 סקוואטים', description: "תורידי את הטוסיק נמוך, שלא ייתפס לך הגב." }
        }
    },
    { 
        type: 'onion', 
        gendered: {
            male: { text: 'תאכל טבעת בצל', description: "ביס בריא, הריח בחינם." },
            female: { text: 'תאכלי טבעת בצל', description: "ביס בריא, הריח בחינם." }
        }
    },
    { 
        type: 'tea_bag', 
        gendered: {
            male: { text: 'לעיסת שקית תה', description: "תהיה בריטי מנומס, רק בלי המים החמים." },
            female: { text: 'לעיסת שקית תה', description: "תהיי בריטית מנומסת, רק בלי המים החמים." }
        }
    },
    { 
        type: 'pasta', 
        gendered: {
            male: { text: 'לאכול פסטה יבשה', description: "קראנץ' איטלקי, בתיאבון גבר." },
            female: { text: 'לאכול פסטה יבשה', description: "קראנץ' איטלקי, בתיאבון." }
        }
    },
    { 
        type: 'water', 
        gendered: {
            male: { text: 'מים על הפנים', description: "תרענן את עצמך, אתה נראה עייף." },
            female: { text: 'מים על הפנים', description: "תרענני את עצמך, את נראית עייפה." }
        }
    },
    { 
        type: 'lipstick', 
        gendered: {
            male: { text: 'שפתון ל-10 דקות', description: "תתאפר, שיהיה לך בוק קוסמופוליטן." },
            female: { text: 'שפתון ל-10 דקות', description: "תתאפרי, שיהיה לך בוק קוסמופוליטן." }
        }
    },
    { 
        type: 'oil', 
        gendered: {
            male: { text: 'כפית שמן', description: "שימון הגרון, שלא תחרוק לנו." },
            female: { text: 'כפית שמן', description: "שימון הגרון, שלא תחרקי לנו." }
        }
    },
    { 
        type: 'chili', 
        gendered: {
            male: { text: 'ביס צ\'ילי חריף', description: "שורף לי בפה, שורף לי בלב." },
            female: { text: 'ביס צ\'ילי חריף', description: "שורף לי בפה, שורף לי בלב." }
        }
    }
];

export const usePlayerGameLogic = (hostId: string | null) => {
  // Registration State
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  // Safety Settings
  const [isAdult, setIsAdult] = useState(false);
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
  
  // Victim info
  const [victimIsAdult, setVictimIsAdult] = useState<boolean>(false);
  const [victimGender, setVictimGender] = useState<"male" | "female">("male");

  // Local Vote Tracking
  const [hasVoted, setHasVoted] = useState(false);
  const [allPlayers, setAllPlayers] = useState<PlayerRow[]>([]); // New: Track all players for 18+ calc
  
  // Realtime Votes from Host
  const [publicVotes, setPublicVotes] = useState<{ likes: number; dislikes: number }>({ likes: 0, dislikes: 0 });

  // Refs
  const myPlayerIdRef = useRef<string | null>(null);
  const myUserIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const broadcastRef = useRef<RealtimeChannel | null>(null);

  const pendingActionRef = useRef<{ type: string; payload: any } | null>(null);

  const heatDebounceRef = useRef<number | null>(null);
  const spinLockRef = useRef(false);
  const voteLockRef = useRef(false);

  useEffect(() => {
    myPlayerIdRef.current = myPlayerId;
  }, [myPlayerId]);

  useEffect(() => {
    if (!isAdult && personalMaxHeat > 2) {
      setPersonalMaxHeat(2);
    }
  }, [isAdult, personalMaxHeat]);

  // איפוס הצבעה כשסטטוס המשחק משתנה
  useEffect(() => {
      if (gameState?.status !== 'challenge') {
          setHasVoted(false);
          voteLockRef.current = false;
          setPublicVotes({ likes: 0, dislikes: 0 });
      }
  }, [gameState?.status]);

  // --- Helpers ---
  const handleKicked = (opts?: { keepInputs?: boolean }) => {
    if (hostId) localStorage.removeItem(`player_id_${hostId}`);

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

  // 3. Realtime Listeners
  useEffect(() => {
    if (!hostId) return;

    const bc = supabase.channel(`room_${hostId}`, {
      config: { broadcast: { self: false } },
    });

    bc.on("broadcast", { event: "game_event" }, (event) => {
        // Listen for vote updates from Host
        if (event.payload.type === "votes_update") {
            setPublicVotes(event.payload.payload);
        }
    });

    bc.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        broadcastRef.current = bc;
        const pending = pendingActionRef.current;
        if (pending) {
          pendingActionRef.current = null;
          void sendAction(pending.type, pending.payload);
        }
      }
    });

    const gameStateChannel = supabase
      .channel(`gamestate_listener_${hostId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_states", filter: `host_id=eq.${hostId}` },
        async (payload) => {
          const next = payload.new as GameStateRow;
          setGameState(next);
          setLocalHeat(next.heat_level ?? 1);

          if (next.current_player_id) {
             const { data } = await supabase
                .from('players')
                .select('is_adult, gender')
                .eq('id', next.current_player_id)
                .single();
             
             if (data) {
                 setVictimIsAdult(data.is_adult);
                 setVictimGender(data.gender === 'female' ? 'female' : 'male');
             }
          }

          const nextSession = next.session_id ?? null;
          if (nextSession && nextSession !== sessionIdRef.current) {
            sessionIdRef.current = nextSession;
            if (myPlayerIdRef.current) handleKicked({ keepInputs: true });
          }

          if (next.status !== "challenge") {
            voteLockRef.current = false;
          }
        }
      )
      .subscribe();

    // -- Updated Players Listener to track ALL players for statistics --
    const playersChannel = supabase
      .channel(`players_listener_${hostId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `host_id=eq.${hostId}` },
        async () => {
            // רענון רשימת השחקנים המלאה בכל שינוי
            // זה פשוט יותר מניהול דלתא
            const { data } = await supabase
                .from("players")
                .select("*")
                .eq("host_id", hostId)
                .eq("is_active", true); // רק פעילים
            
            if (data) {
                setAllPlayers(data as PlayerRow[]);
                
                // בדיקה אם הועפתי
                const myUid = myUserIdRef.current;
                const me = data.find(p => p.user_id === myUid);
                
                if (myPlayerIdRef.current && !me) {
                    handleKicked({ keepInputs: true });
                } else if (me && sessionIdRef.current && me.session_id !== sessionIdRef.current) {
                    handleKicked({ keepInputs: true });
                }
            }
        }
      )
      .subscribe();
      
      // טעינה ראשונית של שחקנים
      supabase.from("players").select("*").eq("host_id", hostId).eq("is_active", true).then(({data}) => {
          if (data) setAllPlayers(data as PlayerRow[]);
      });

    return () => {
      if (heatDebounceRef.current) {
        window.clearTimeout(heatDebounceRef.current);
        heatDebounceRef.current = null;
      }
      supabase.removeChannel(bc);
      broadcastRef.current = null;
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
        setIsAdult(p.is_adult);
        setPersonalMaxHeat(p.max_heat_level);
      }
    })();
  }, [hostId, authReady, gameState?.session_id]);

  // --- Actions ---
  const sendAction = async (type: string, payload: any = {}) => {
    if (!hostId || !myPlayerIdRef.current) return;
    const channel = broadcastRef.current;
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
          [{
              host_id: hostId,
              user_id: userId,
              session_id: sessionId,
              is_active: true,
              name,
              gender,
              avatar: imagePreview ?? "bg-pink-500",
              is_adult: isAdult,
              max_heat_level: personalMaxHeat
            }],
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
    window.setTimeout(() => { spinLockRef.current = false; }, 800);
  };

  const handleHeatChange = (val: number) => {
    const allowedMax = personalMaxHeat; 
    let finalVal = val;
    if (finalVal > allowedMax) finalVal = allowedMax;
    
    setLocalHeat(finalVal);
    if (heatDebounceRef.current) window.clearTimeout(heatDebounceRef.current);
    heatDebounceRef.current = window.setTimeout(() => {
      void sendAction("update_heat", finalVal);
    }, 120);
  };

  const sendEmoji = (icon: string) => {
    void sendAction("emoji", icon);
  };

  const sendVote = (type: "vote_like" | "vote_dislike" | "action_skip") => {
    if (voteLockRef.current || hasVoted) return; // Prevent double vote
    
    voteLockRef.current = true;
    if (type !== 'action_skip') setHasVoted(true); // עונש עצמי (skip) לא נועל את הממשק כמו הצבעה רגילה
    
    void sendAction(type);
    window.setTimeout(() => { voteLockRef.current = false; }, 600);
  };

  const sendChoice = (choice: "אמת" | "חובה") => {
    void sendAction("player_choice", choice);
  };

  const sendPenaltyPreview = (penalty: any) => {
      void sendAction("penalty_preview", penalty);
  };

  const sendPenaltySelection = (penalty: any) => {
      void sendAction("penalty_selected", penalty);
  };

  return {
    name, setName,
    gender, setGender,
    imagePreview, handleImageUpload,
    isAdult, setIsAdult,
    personalMaxHeat, setPersonalMaxHeat,
    isSubmitted, loading, authReady, authUser, gameState, localHeat, myPlayerId,
    victimIsAdult, victimGender,
    allPlayers, 
    hasVoted, 
    publicVotes,
    handleJoin, handleLeaveGame, handleSpin, handleHeatChange, sendEmoji, sendVote, sendChoice,
    sendPenaltyPreview, sendPenaltySelection
  };
};