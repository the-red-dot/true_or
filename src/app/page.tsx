// truth-or-dare-ai\src\app\page.tsx

// src\app\page.tsx

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
  Sparkles,
  Cpu,
  Beer,
  ThumbsUp,
  ThumbsDown
} from "lucide-react";
import confetti from "canvas-confetti";
import QRCode from "react-qr-code";
import { supabase } from "@/app/lib/supabase";
import Link from "next/link";
import { User, RealtimeChannel } from "@supabase/supabase-js";

// --- Types ---
type Player = {
  id: string;
  name: string;
  gender: "male" | "female" | "other";
  avatar: string; 
  host_id: string;
};

type Challenge = {
  content: string;
  spiciness: number;
  themeColor: string;
  usedModel?: string;
};

// מיקום בועת דיבור
type BubbleReaction = { id: string; emoji: string; x: number; y: number; };

export default function TruthOrDareGame() {
  // --- State ---
  const [gameState, setGameState] = useState<"lobby" | "spinning" | "spotlight" | "revealing" | "challenge" | "penalty">("lobby");
  const [players, setPlayers] = useState<Player[]>([]);
  const [heatLevel, setHeatLevel] = useState<number>(1);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [challengeType, setChallengeType] = useState<"אמת" | "חובה" | null>(null);
  const [currentChallenge, setCurrentChallenge] = useState<Challenge | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  
  // Auth & Connection State
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(true);

  // --- Interactive State ---
  const [reactions, setReactions] = useState<BubbleReaction[]>([]); 
  const [votes, setVotes] = useState<{likes: number, dislikes: number, shots: number}>({likes: 0, dislikes: 0, shots: 0});
  const [shotVoteMode, setShotVoteMode] = useState(false);

  // Refs כדי לדעת איפה כל שחקן ממוקם על המסך (עבור בועות הדיבור)
  const playerRefs = useRef<{[key: string]: HTMLDivElement | null}>({});

  // --- Sync Game State to DB ---
  // פונקציה זו מעדכנת את הטבלה כדי שהטלפונים ידעו מה המצב
  const syncGameStateToDB = async (status: string, playerId: string | null = null, challenge: any = null) => {
      if (!authUser) return;
      await supabase.from('game_states').upsert({
          host_id: authUser.id,
          status: status,
          current_player_id: playerId,
          challenge_text: challenge?.content || null,
          challenge_type: challengeType,
          heat_level: heatLevel, // מסנכרנים גם את רמת החום
          updated_at: new Date().toISOString()
      });
  };

  // --- לוגיקת אוטומציה לעונש (דילוג) ---
  useEffect(() => {
    if (gameState === "penalty") {
        // מחכים 5 שניות במצב שוט, ואז מאפסים לבד ללובי
        const timer = setTimeout(() => {
            setGameState("lobby");
            // מעבירים את התור לשחקן הבא או משאירים בלובי
            syncGameStateToDB("lobby", selectedPlayer?.id); 
        }, 5000);
        return () => clearTimeout(timer);
    }
  }, [gameState]);

  // --- Realtime Listeners ---
  useEffect(() => {
    let channel: RealtimeChannel | null = null;

    const setupRealtime = async (userId: string) => {
        // טעינת שחקנים ראשונית
        const { data } = await supabase.from('players').select('*').eq('host_id', userId).order('created_at', { ascending: true });
        if (data) setPlayers(data as Player[]);

        // האזנה לשינויים ב-game_states (אם הטלפון מעדכן את רמת החום או עושה Spin)
        const gameStateChannel = supabase.channel(`gamestate_sync_${userId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_states', filter: `host_id=eq.${userId}` }, 
            (payload) => {
                const newState = payload.new;
                // עדכון רמת החום מהטלפון
                if (newState.heat_level) setHeatLevel(newState.heat_level);
                
                // אם הטלפון יזם סיבוב גלגל
                if (newState.status === 'spinning' && gameState !== 'spinning') {
                    handlePhoneTriggeredSpin();
                }

                // אם הטלפון דילג או סיים (למרות שהטלפון שולח event, ה-DB הוא ה-Source of Truth)
                if (newState.status === 'penalty') setGameState('penalty');
                if (newState.status === 'lobby' && gameState !== 'lobby') setGameState('lobby');
            })
            .subscribe();

        // האזנה לאירועים (Broadcasts) ושינויי שחקנים
        channel = supabase
          .channel(`room_${userId}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: `host_id=eq.${userId}` }, 
            (payload) => setPlayers((prev) => [...prev, payload.new as Player])
          )
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'players', filter: `host_id=eq.${userId}` }, 
            (payload) => setPlayers((prev) => prev.filter(p => p.id !== payload.old.id))
          )
          .on('broadcast', { event: 'game_event' }, (event) => {
              handleGameEvent(event.payload);
          })
          .subscribe((status) => setIsConnected(status === 'SUBSCRIBED'));
          
          return () => { supabase.removeChannel(gameStateChannel); }
    };

    const handlePhoneTriggeredSpin = () => {
        // הטלפון ביקש לסובב - אנחנו מריצים את האנימציה בטלוויזיה
        setGameState("spinning");
        setTimeout(() => {
           // הלוגיקה של בחירת שחקן נעשית בטלוויזיה או בטלפון? 
           // בגרסה פשוטה: הטלוויזיה מחליטה מי הזוכה ומעדכנת
           chooseRandomPlayer();
        }, 3000);
    };

    const chooseRandomPlayer = () => {
        if (players.length < 1) return;
        const randomPlayer = players[Math.floor(Math.random() * players.length)];
        setSelectedPlayer(randomPlayer);
        const type = Math.random() > 0.5 ? "אמת" : "חובה";
        setChallengeType(type);
        setGameState("spotlight");
        // מעדכנים את ה-DB שכולם ידעו שנבחר שחקן
        syncGameStateToDB("spotlight", randomPlayer.id);
    };

    const handleGameEvent = (data: any) => {
        const { type, payload, playerId } = data;
        
        // --- טיפול באימוג'ים מרחפים לפי מיקום השחקן ---
        if (type === 'emoji') {
            const playerElement = playerRefs.current[playerId];
            let startX = 50; 
            let startY = 50;

            if (playerElement) {
                const rect = playerElement.getBoundingClientRect();
                // חישוב מיקום יחסי באחוזים של המסך
                startX = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
                startY = ((rect.top) / window.innerHeight) * 100;
            }

            const id = Math.random().toString(36);
            setReactions(prev => [...prev, { id, emoji: payload, x: startX, y: startY }]);
            setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 2500);
        }

        // Voting Logic
        if (type === 'vote_like') setVotes(v => ({ ...v, likes: v.likes + 1 }));
        if (type === 'vote_dislike') setVotes(v => ({ ...v, dislikes: v.dislikes + 1 }));
        if (type === 'vote_shot') {
             setVotes(v => {
                 const newShots = v.shots + 1;
                 const activeVoters = Math.max(1, players.length - 1);
                 if (newShots > activeVoters * 0.49) triggerGroupShot();
                 return { ...v, shots: newShots };
             });
        }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
            setAuthUser(session.user);
            setJoinUrl(`${window.location.origin}/join?hostId=${session.user.id}`);
            setupRealtime(session.user.id);
        } else {
            setAuthUser(null);
            setPlayers([]);
        }
    });

    return () => {
        authListener.subscription.unsubscribe();
        if (channel) supabase.removeChannel(channel);
    };
  }, [players.length, gameState]); // תלויות

  // --- אפקטים ---
  useEffect(() => {
      // מעבר אוטומטי מספוטלייט לחשיפה
      if (gameState === "spotlight") {
          const timer = setTimeout(() => {
              setGameState("revealing");
              syncGameStateToDB("revealing", selectedPlayer?.id);
          }, 2500);
          return () => clearTimeout(timer);
      }
  }, [gameState]);

  // --- Fetch Challenge from API (DB) ---
  useEffect(() => {
    if (gameState === "revealing" && selectedPlayer && challengeType && authUser) {
      const fetchChallenge = async () => {
        try {
          const { data: historyData } = await supabase
            .from('challenge_history')
            .select('challenge_text')
            .eq('host_id', authUser.id)
            .eq('player_id', selectedPlayer.id);

          const playerPrevTasks = historyData?.map(h => h.challenge_text) || [];

          const res = await fetch("/api/generate", {
            method: "POST",
            body: JSON.stringify({
              playerName: selectedPlayer.name,
              playerGender: selectedPlayer.gender,
              heatLevel: heatLevel,
              type: challengeType,
              previousChallenges: playerPrevTasks
            }),
          });
          const data = await res.json();
          setCurrentChallenge(data);
          
          if (data.content) {
              await supabase.from('challenge_history').insert({
                  host_id: authUser.id,
                  player_id: selectedPlayer.id,
                  challenge_text: data.content,
                  type: challengeType
              });
          }

          setGameState("challenge");
          // עדכון ה-DB עם האתגר כדי שהטלפון יציג אותו
          syncGameStateToDB("challenge", selectedPlayer.id, data);
          
        } catch (error) {
          console.error("Error", error);
          setGameState("challenge");
        } 
      };
      fetchChallenge();
    }
  }, [gameState]);

  // לוגיקה שהתייתרה (כי הטלפון שולט) אבל נשארת לתצוגה
  const triggerGroupShot = () => {
      setShotVoteMode(true);
      setTimeout(() => {
          setShotVoteMode(false);
          setGameState("lobby");
          syncGameStateToDB("lobby");
      }, 5000);
  };

  const handleManualRefresh = async () => {
      if (!authUser) return;
      const { data } = await supabase.from('players').select('*').eq('host_id', authUser.id);
      if (data) setPlayers(data as Player[]);
  };

  const resetGame = async () => {
    if (!authUser) return;
    if (confirm("בטוח שאתה רוצה לאפס הכל?")) {
        await supabase.from('players').delete().eq('host_id', authUser.id);
        await supabase.from('challenge_history').delete().eq('host_id', authUser.id);
        setPlayers([]); 
    }
  };

  return (
    <main className="h-screen w-screen bg-black text-white font-sans overflow-hidden relative selection:bg-pink-500" dir="rtl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-black to-black z-0 pointer-events-none" />
      
      {/* --- Floating Emojis --- */}
      <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
          <AnimatePresence>
              {reactions.map(r => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, scale: 0, x: `${r.x}vw`, y: `${r.y}vh` }}
                    animate={{ opacity: 1, scale: 1.5, y: `${r.y - 20}vh` }} // עולה למעלה
                    exit={{ opacity: 0, scale: 0.5, y: `${r.y - 30}vh` }}
                    transition={{ duration: 2, ease: "easeOut" }}
                    className="absolute text-6xl drop-shadow-2xl flex items-center justify-center"
                  >
                      {/* בועת דיבור מעוצבת */}
                      <div className="relative">
                          <span className="z-10 relative">{r.emoji}</span>
                      </div>
                  </motion.div>
              ))}
          </AnimatePresence>
      </div>

      {/* --- Shot Vote Alert --- */}
      <AnimatePresence>
          {shotVoteMode && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 z-[100] bg-red-600/95 backdrop-blur-xl flex flex-col items-center justify-center text-white"
              >
                  <h1 className="text-9xl font-black uppercase animate-bounce">SHOT TIME!</h1>
                  <Beer size={150} className="mt-12 animate-spin text-yellow-300" />
              </motion.div>
          )}
      </AnimatePresence>

      {/* --- Top Bar (Host Controls) --- */}
      <div className="absolute top-4 left-4 z-50 flex gap-2 items-center ltr opacity-30 hover:opacity-100 transition-opacity">
         {/* ... כפתורי שליטה טכניים למארח ... */}
         {authUser && <button onClick={handleManualRefresh}><RefreshCw size={20}/></button>}
         {authUser && <button onClick={resetGame}><Trash2 size={20}/></button>}
         {!isConnected && <WifiOff className="text-red-500 animate-pulse"/>}
      </div>

      {/* --- Main Content Container (Safe Area) --- */}
      <div className="w-full h-full p-8 md:p-12 flex flex-col items-center relative z-10">

        {/* --- LOBBY: Players Grid --- */}
        {gameState === "lobby" && (
            <div className="flex flex-col items-center justify-center h-full w-full">
                <h1 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-cyan-500 mb-12 drop-shadow-lg">
                    אמת או חובה
                </h1>

                {/* אזור השחקנים - כאן אנחנו שומרים Ref לכל שחקן */}
                <div className="flex flex-wrap gap-8 justify-center items-center w-full max-w-6xl">
                    {players.length === 0 ? (
                        <div className="text-gray-500 text-3xl font-bold animate-pulse">סרקו את הקוד להצטרפות...</div>
                    ) : (
                        players.map((p) => (
                            <div 
                                key={p.id} 
                                ref={el => { playerRefs.current[p.id] = el }} // שמירת המיקום
                                className="flex flex-col items-center gap-3 relative group"
                            >
                                <div className={`w-28 h-28 rounded-full border-4 border-white/20 shadow-2xl overflow-hidden transition-transform transform group-hover:scale-110`}>
                                   {p.avatar.startsWith('bg-') ? <div className={`w-full h-full ${p.avatar}`} /> : <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />}
                                </div>
                                <span className="font-bold text-xl text-white drop-shadow-md bg-black/50 px-3 py-1 rounded-full">{p.name}</span>
                            </div>
                        ))
                    )}
                </div>

                {/* QR Code */}
                {authUser && joinUrl && (
                    <div className="absolute bottom-10 right-10 bg-white p-3 rounded-xl transform rotate-3 shadow-2xl">
                        <QRCode value={joinUrl} size={120} />
                    </div>
                )}
                
                {/* חיווי רמת חום (שנשלטת מהטלפון) */}
                <div className="absolute bottom-10 left-10 flex items-center gap-2 bg-black/60 px-6 py-3 rounded-full border border-pink-500/50">
                    <Flame className="text-pink-500" />
                    <span className="text-xl font-bold">רמת חום: {heatLevel}</span>
                </div>
            </div>
        )}

        {/* --- SPINNING --- */}
        {gameState === "spinning" && (
           <div className="flex flex-col items-center justify-center h-full">
               <motion.div animate={{ rotate: 1080 }} transition={{ duration: 3, ease: "circOut" }} className="text-9xl">🎡</motion.div>
           </div>
        )}

        {/* --- SPOTLIGHT --- */}
        {gameState === "spotlight" && selectedPlayer && (
           <div className="flex flex-col items-center justify-center h-full">
               <div className="w-64 h-64 rounded-full overflow-hidden border-8 border-pink-500 shadow-[0_0_100px_rgba(236,72,153,0.5)] mb-8">
                   {selectedPlayer.avatar.startsWith('bg-') ? <div className={`w-full h-full ${selectedPlayer.avatar}`} /> : <img src={selectedPlayer.avatar} className="w-full h-full object-cover" />}
               </div>
               <h2 className="text-6xl font-black">{selectedPlayer.name}</h2>
           </div>
        )}

        {/* --- REVEALING --- */}
        {gameState === "revealing" && (
            <div className="flex flex-col items-center justify-center h-full">
                <Sparkles className="w-32 h-32 text-purple-400 animate-pulse" />
            </div>
        )}

        {/* --- CHALLENGE --- */}
        {gameState === "challenge" && currentChallenge && selectedPlayer && (
            <div className="flex flex-col items-center justify-center h-full w-full max-w-5xl">
                <div className="flex items-center gap-4 mb-8">
                     <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white">
                        {selectedPlayer.avatar.startsWith('bg-') ? <div className={`w-full h-full ${selectedPlayer.avatar}`} /> : <img src={selectedPlayer.avatar} className="w-full h-full object-cover" />}
                     </div>
                     <div className="text-left">
                         <h3 className="text-2xl font-bold">{selectedPlayer.name}</h3>
                         <span className={`text-4xl font-black uppercase ${challengeType === 'אמת' ? 'text-blue-400' : 'text-pink-500'}`}>{challengeType}</span>
                     </div>
                </div>

                <div className="bg-white/10 backdrop-blur-md p-12 rounded-[3rem] border border-white/20 shadow-2xl w-full text-center relative">
                    <p className="text-4xl md:text-6xl font-black leading-tight" style={{ color: currentChallenge.themeColor }}>
                        {currentChallenge.content}
                    </p>
                    
                    {/* Voting Bars */}
                    <div className="mt-12 h-4 w-full bg-gray-900 rounded-full overflow-hidden flex">
                        <div className="bg-green-500 h-full transition-all duration-500" style={{ width: `${(votes.likes / Math.max(1, players.length-1)) * 100}%` }} />
                        <div className="bg-red-500 h-full transition-all duration-500" style={{ width: `${(votes.dislikes / Math.max(1, players.length-1)) * 100}%` }} />
                    </div>
                </div>
            </div>
        )}

        {/* --- PENALTY (SHOT) --- */}
        {gameState === "penalty" && (
             <div className="flex flex-col items-center justify-center h-full bg-red-900/90 absolute inset-0 z-50">
                 <h1 className="text-9xl font-black border-8 border-white p-10 rotate-6 uppercase">SHOT!</h1>
                 <p className="mt-8 text-3xl font-bold">{selectedPlayer?.name} מוותר...</p>
                 <p className="mt-4 text-xl opacity-70">חוזרים למשחק בעוד רגע...</p>
             </div>
        )}

      </div>
    </main>
  );
}