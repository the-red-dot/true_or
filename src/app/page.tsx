"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Flame, CheckCircle, XCircle, Trash2, LogOut, User as UserIcon, 
  WifiOff, RefreshCw, Sparkles, Cpu, Beer, ThumbsUp, ThumbsDown 
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

// עדכון טיפוס כדי לנהל אימוג'ים פר שחקן
type PlayerEmojiState = {
    [playerId: string]: string | null;
}

export default function TruthOrDareGame() {
  // --- State ---
  const [gameState, setGameState] = useState<"lobby" | "spinning" | "spotlight" | "revealing" | "challenge" | "penalty">("lobby");
  const [players, setPlayers] = useState<Player[]>([]);
  const [heatLevel, setHeatLevel] = useState<number>(1);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [controllingPlayerId, setControllingPlayerId] = useState<string | null>(null); // מי שולט (מסובב)
  const [challengeType, setChallengeType] = useState<"אמת" | "חובה" | null>(null);
  const [currentChallenge, setCurrentChallenge] = useState<Challenge | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");
  
  // Auth & Connection State
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(true);

  // --- Interactive State ---
  const [playerEmojis, setPlayerEmojis] = useState<PlayerEmojiState>({});
  const [votes, setVotes] = useState<{likes: number, dislikes: number, shots: number}>({likes: 0, dislikes: 0, shots: 0});
  const [shotVoteMode, setShotVoteMode] = useState(false);

  // --- Sync Game State to DB ---
  const syncGameStateToDB = async (status: string, playerId: string | null = null, challenge: any = null, controllerId: string | null = null) => {
      if (!authUser) return;
      await supabase.from('game_states').upsert({
          host_id: authUser.id,
          status: status,
          current_player_id: playerId, // הקורבן הנוכחי
          controlling_player_id: controllerId || controllingPlayerId, // מי מחזיק בשרביט
          challenge_text: challenge?.content || null,
          challenge_type: challengeType,
          heat_level: heatLevel, // מסנכרנים את החום גם מכאן
          updated_at: new Date().toISOString()
      });
  };

  // --- Realtime Players Listener & Auth Listener ---
  useEffect(() => {
    let channel: RealtimeChannel | null = null;

    const setupRealtime = async (userId: string) => {
        // Load initial players
        const { data, error } = await supabase.from('players').select('*').eq('host_id', userId).order('created_at', { ascending: true });
        if (data) {
            setPlayers(data as Player[]);
            // אם אין שולט מוגדר, נקבע שהמארח שולט או השחקן הראשון
            if (!controllingPlayerId && data.length > 0) {
                 // ברירת מחדל: המארח עצמו אם הוא משחק, או השחקן הראשון
                 // נשמור ריק בינתיים, ה-spinTheWheel יטפל בזה
            }
        }
        if (error) setIsConnected(false); else setIsConnected(true);

        // Load initial Game State if exists (for recovery)
        const { data: gs } = await supabase.from('game_states').select('*').eq('host_id', userId).single();
        if (gs) {
            if(gs.heat_level) setHeatLevel(gs.heat_level);
            // אם יש שליטה מרחוק, צריך לוודא שאנחנו לא דורסים את המצב המקומי סתם
        }

        if (channel) supabase.removeChannel(channel);
        
        channel = supabase
          .channel(`room_${userId}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: `host_id=eq.${userId}` }, 
            (payload) => setPlayers((prev) => [...prev, payload.new as Player]))
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'players', filter: `host_id=eq.${userId}` }, 
            (payload) => setPlayers((prev) => prev.filter(p => p.id !== payload.old.id)))
          // האזנה לשינויים ב-game_states (אם הטלפון מעדכן ספין)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_states', filter: `host_id=eq.${userId}` },
            (payload) => {
                const newState = payload.new;
                // אם הטלפון שינה סטטוס ל-spinning והטלוויזיה עדיין בלובי
                if (newState.status === 'spinning' && gameState !== 'spinning') {
                    if (newState.heat_level) setHeatLevel(newState.heat_level);
                    spinTheWheel(); // הפעלת האנימציה בטלוויזיה
                }
            })
          .on('broadcast', { event: 'game_event' }, (event) => {
              handleGameEvent(event.payload);
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') setIsConnected(true);
            else setIsConnected(false);
          });
    };

    const handleGameEvent = (data: any) => {
        const { type, payload, playerId } = data;
        
        // הצגת אימוג'י על שחקן ספציפי
        if (type === 'emoji') {
            setPlayerEmojis(prev => ({ ...prev, [playerId]: payload }));
            setTimeout(() => {
                setPlayerEmojis(prev => ({ ...prev, [playerId]: null }));
            }, 3000);
        }

        // שחקן ויתר דרך הטלפון
        if (type === 'action_skip' && gameState === 'challenge') {
            handleSkip(); 
        }

        // שחקן אישר ביצוע (דרך הטלפון - vote_like במקרה של השחקן הפעיל)
        if (type === 'vote_like' && playerId === selectedPlayer?.id && gameState === 'challenge') {
             handleDone();
        } else if (type === 'vote_like') {
             setVotes(v => ({ ...v, likes: v.likes + 1 }));
        }

        if (type === 'vote_dislike') setVotes(v => ({ ...v, dislikes: v.dislikes + 1 }));
        if (type === 'vote_shot') {
             setVotes(v => {
                 const newShots = v.shots + 1;
                 const activeVoters = Math.max(1, players.length - 1);
                 if (newShots > activeVoters * 0.49) {
                     triggerGroupShot();
                 }
                 return { ...v, shots: newShots };
             });
        }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
            setAuthUser(session.user);
            if (typeof window !== "undefined") {
                setJoinUrl(`${window.location.origin}/join?hostId=${session.user.id}`);
            }
            setupRealtime(session.user.id);
        } else {
            setAuthUser(null);
            setPlayers([]);
            if (channel) supabase.removeChannel(channel);
        }
    });

    return () => {
        authListener.subscription.unsubscribe();
        if (channel) supabase.removeChannel(channel);
    };
  }, [players.length, gameState, selectedPlayer]);

  // לוגיקת סיום משימה (הצלחה)
  const handleDone = () => {
    confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 }, colors: ['#ff00ff', '#00ffff', '#ffff00'] });
    
    // מעדכנים שהשחקן הנוכחי הופך לשולט (זה שמסובב את הגלגל בסיבוב הבא)
    const nextController = selectedPlayer?.id || null;
    setControllingPlayerId(nextController);
    
    setTimeout(() => {
        setGameState("lobby");
        // עדכון בסיס הנתונים: סטטוס לובי, והשחקן השולט החדש
        syncGameStateToDB("lobby", null, null, nextController);
    }, 2500);
  };

  // לוגיקת דילוג (שוט) - אוטומטי
  const handleSkip = () => {
    setGameState("penalty");
    // אין עדכון DB מיידי ל-Lobby כדי שכולם יראו את מסך העונש
    if (authUser) {
        supabase.from('game_states').update({ status: 'penalty' }).eq('host_id', authUser.id);
    }
  };

  // טיפול במצב Penalty (חזרה אוטומטית ללובי)
  useEffect(() => {
      if (gameState === 'penalty') {
          const timer = setTimeout(() => {
              // מי שלקח שוט מקבל את השליטה לסובב בסיבוב הבא
              const nextController = selectedPlayer?.id || null;
              setControllingPlayerId(nextController);
              
              setGameState("lobby");
              syncGameStateToDB("lobby", null, null, nextController);
          }, 5000); // השהייה של 5 שניות
          return () => clearTimeout(timer);
      }
  }, [gameState, selectedPlayer]);


  // אתחול שליטה ראשונית
  useEffect(() => {
      // אם יש שחקנים ואין אף אחד ששולט, ניתן את השליטה למארח או לשחקן הראשון
      if (players.length > 0 && !controllingPlayerId && gameState === 'lobby') {
          const firstPlayer = players[0].id;
          setControllingPlayerId(firstPlayer);
          syncGameStateToDB("lobby", null, null, firstPlayer);
      }
  }, [players, controllingPlayerId, gameState]);


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
      const { data } = await supabase.from('players').select('*').eq('host_id', authUser.id).order('created_at', { ascending: true });
      if (data) setPlayers(data as Player[]);
  };

  const resetGame = async () => {
    if (!authUser) return;
    if (confirm("בטוח שאתה רוצה לאפס את המשחק ולמחוק את כל השחקנים וההיסטוריה?")) {
        await supabase.from('players').delete().eq('host_id', authUser.id);
        await supabase.from('challenge_history').delete().eq('host_id', authUser.id);
        await supabase.from('game_states').delete().eq('host_id', authUser.id); // איפוס מצב
        setPlayers([]); 
    }
  };

  const spinTheWheel = () => {
    if (players.length < 2) return; // צריך לפחות 2 שחקנים
    
    setGameState("spinning");
    setVotes({likes: 0, dislikes: 0, shots: 0}); // איפוס הצבעות
    
    // סינכרון מיידי ל-DB שהגלגל מסתובב (למקרה שהופעל מהמחשב)
    // אם הופעל מהטלפון, זה כבר מעודכן, אבל זה לא מזיק
    syncGameStateToDB("spinning", null, null, controllingPlayerId);
    
    setTimeout(() => {
      // בחירת שחקן *אחר* מהשחקן השולט הנוכחי (כדי שלא יצא שהוא נותן משימה לעצמו - אופציונלי, אבל הגיוני במשחק)
      // לבינתיים רנדומלי לחלוטין כמו בבקשה
      let randomPlayer = players[Math.floor(Math.random() * players.length)];
      
      // אופציונלי: למנוע מאותו שחקן להיבחר פעמיים ברצף? (לא חובה)
      
      setSelectedPlayer(randomPlayer);
      const type = Math.random() > 0.5 ? "אמת" : "חובה";
      setChallengeType(type);
      setGameState("spotlight");
      
      syncGameStateToDB("spotlight", randomPlayer.id); // עדכון מי נבחר
    }, 3000);
  };

  useEffect(() => {
      if (gameState === "spotlight") {
          const timer = setTimeout(() => {
              setGameState("revealing");
              syncGameStateToDB("revealing", selectedPlayer?.id);
          }, 2500);
          return () => clearTimeout(timer);
      }
  }, [gameState]);

  // --- Gemini Generation ---
  useEffect(() => {
    if (gameState === "revealing" && selectedPlayer && challengeType && authUser) {
      const fetchChallenge = async () => {
        setLoadingAI(true);
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
          syncGameStateToDB("challenge", selectedPlayer.id, data);

        } catch (error) {
          console.error("AI/DB Error", error);
          const fallback = {
             content: "ה-AI התעייף... תעשה שוט!",
             spiciness: 1,
             themeColor: "#ff0000",
             usedModel: "Fallback"
          };
          setCurrentChallenge(fallback);
          setGameState("challenge");
          syncGameStateToDB("challenge", selectedPlayer.id, fallback);
        } finally {
          setLoadingAI(false);
        }
      };
      fetchChallenge();
    }
  }, [gameState]);

  return (
    <main className="h-screen w-screen bg-black text-white font-sans overflow-hidden relative selection:bg-pink-500 flex flex-col" dir="rtl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-black to-black z-0 pointer-events-none" />
      <div className={`absolute inset-0 transition-opacity duration-1000 z-0 opacity-30 ${heatLevel > 7 ? 'bg-red-900/20' : 'bg-transparent'}`} />

      {/* --- Shot Vote Alert --- */}
      <AnimatePresence>
          {shotVoteMode && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-[100] bg-red-600/95 backdrop-blur-xl flex flex-col items-center justify-center text-white"
              >
                  <h1 className="text-9xl font-black uppercase tracking-tighter mb-8 animate-bounce drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]">SHOT TIME!</h1>
                  <p className="text-5xl font-bold">הקהל החליט: כולם שותים!</p>
                  <Beer size={150} className="mt-12 animate-spin text-yellow-300" />
              </motion.div>
          )}
      </AnimatePresence>

      {/* --- Top Bar --- */}
      <div className="absolute top-4 left-4 z-50 flex flex-col gap-2 items-end ltr">
        {authUser ? (
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 shadow-lg">
                <button onClick={handleManualRefresh} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-400" title="רענן רשימה"><RefreshCw size={16} /></button>
                <button onClick={() => supabase.auth.signOut()} className="p-2 hover:bg-red-500/20 rounded-full transition-colors text-red-400" title="התנתק"><LogOut size={16} /></button>
                <div className="flex flex-col text-xs text-right">
                    <span className="text-gray-400">Host:</span>
                    <span className="font-bold text-white">{authUser.email?.split('@')[0]}</span>
                </div>
            </div>
        ) : (
            <Link href="/login" className="flex items-center gap-2 bg-pink-600 hover:bg-pink-500 px-4 py-2 rounded-full font-bold text-sm transition-colors shadow-lg">
                <UserIcon size={16} /> התחברות למארח
            </Link>
        )}
        {!isConnected && <div className="flex items-center gap-2 bg-red-900/80 px-4 py-1 rounded-full text-red-200 text-xs font-bold animate-pulse"><WifiOff size={14} /> מנותק</div>}
      </div>

      {/* --- LOBBY --- */}
      {gameState === "lobby" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 flex flex-col items-center justify-center h-full space-y-4 p-4">
          <h1 className="text-6xl md:text-8xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 drop-shadow-[0_0_25px_rgba(236,72,153,0.6)] text-center tracking-tighter">
            אמת או חובה <br/> <span className="text-3xl md:text-4xl text-white font-light tracking-widest opacity-80">AI EDITION</span>
          </h1>

          <div className="flex flex-wrap gap-8 justify-center items-center min-h-[150px] px-10 max-w-[90vw]">
            {players.length === 0 ? (
              <div className="text-gray-500 text-2xl animate-pulse font-bold">
                {authUser ? "ממתין לשחקנים... סרקו את הקוד" : "נא להתחבר כדי להתחיל משחק"}
              </div>
            ) : (
              players.map((p) => (
                <motion.div key={p.id} initial={{ scale: 0 }} animate={{ scale: 1 }} className="relative flex flex-col items-center gap-2 group">
                    {/* Emoji Bubble attached to avatar */}
                    <AnimatePresence>
                        {playerEmojis[p.id] && (
                            <motion.div 
                                initial={{ opacity: 0, y: 20, scale: 0.5 }}
                                animate={{ opacity: 1, y: -60, scale: 1.2 }}
                                exit={{ opacity: 0, scale: 0 }}
                                className="absolute -top-10 z-50 bg-white text-black text-4xl p-2 rounded-xl shadow-xl border-2 border-pink-500 bubble-arrow-down min-w-[60px] text-center"
                            >
                                {playerEmojis[p.id]}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* סימון של מי השולט בשרביט כרגע */}
                    {controllingPlayerId === p.id && (
                        <motion.div 
                            initial={{ y: -10 }} animate={{ y: -20 }} transition={{ repeat: Infinity, repeatType: "reverse" }}
                            className="absolute -top-10 text-3xl z-20 drop-shadow-lg"
                        >
                            🪄
                        </motion.div>
                    )}

                    <div className={`w-24 h-24 rounded-full border-4 transition-all duration-300 overflow-hidden shadow-[0_0_20px_rgba(255,255,255,0.2)] ${controllingPlayerId === p.id ? 'border-purple-500 ring-4 ring-purple-500/30 scale-110' : 'border-white/30 group-hover:border-pink-500'}`}>
                       {p.avatar.startsWith('bg-') ? <div className={`w-full h-full ${p.avatar}`} /> : <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />}
                    </div>
                    <span className="font-bold text-lg text-white drop-shadow-md bg-black/50 px-3 py-1 rounded-full">{p.name}</span>
                </motion.div>
              ))
            )}
          </div>

          {/* לוח בקרה למארח (Backup) ו QR */}
          <div className="flex items-center gap-10 mt-8 w-full max-w-4xl justify-center relative">
             {/* QR Code */}
             <div className="bg-white p-3 rounded-2xl opacity-90 shadow-2xl flex flex-col items-center gap-1">
                 {authUser && joinUrl ? (
                    <div style={{ height: "auto", maxWidth: "120px", width: "100%" }}>
                      <QRCode size={256} style={{ height: "auto", maxWidth: "100%", width: "100%" }} value={joinUrl} viewBox={`0 0 256 256`} />
                    </div>
                 ) : <div className="w-[120px] h-[120px] bg-gray-200" />}
                 <p className="text-black text-[10px] font-black tracking-widest uppercase">סרוק להצטרפות</p>
             </div>

             <div className="bg-white/5 backdrop-blur-xl p-6 rounded-[2rem] border border-white/10 flex-1 h-full shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-cyan-400 font-bold text-xl flex items-center gap-2"><Flame className="fill-cyan-400" /> רמת חום: {heatLevel}</span>
                  <div className="text-xs text-gray-400">
                      השליטה אצל: <span className="text-purple-400 font-bold text-lg">{players.find(p => p.id === controllingPlayerId)?.name || 'כולם'}</span>
                  </div>
                </div>
                {/* Visual Slider (Read Only mostly, updated by phone) */}
                <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden mb-4">
                    <div className="h-full bg-gradient-to-r from-yellow-400 via-orange-500 to-red-600 transition-all duration-500" style={{ width: `${heatLevel * 10}%` }} />
                </div>
                
                <div className="flex justify-center gap-4">
                  <button onClick={resetGame} disabled={!authUser} className="px-4 py-3 bg-red-900/30 hover:bg-red-800/80 border border-red-500/30 rounded-xl text-red-200 text-sm flex items-center gap-2">
                    <Trash2 size={18} /> איתחול
                  </button>
                  <button onClick={spinTheWheel} disabled={players.length < 2 || !authUser} className="flex-1 px-6 py-3 bg-gray-700/50 rounded-xl font-bold text-gray-400 hover:bg-gray-700 transition-all text-sm border border-white/10 flex items-center justify-center gap-2">
                     ספין ידני (גיבוי)
                  </button>
                </div>
             </div>
          </div>
        </motion.div>
      )}

      {/* --- SPINNING --- */}
      {gameState === "spinning" && (
        <div className="flex flex-col items-center justify-center h-full z-10 relative">
          <motion.div animate={{ rotate: 360 * 10 }} transition={{ duration: 3, ease: "circOut" }} className="w-80 h-80 rounded-full border-8 border-dashed border-cyan-500/50 flex items-center justify-center relative shadow-[0_0_100px_rgba(6,182,212,0.4)]">
            <div className="absolute inset-0 bg-cyan-500/10 rounded-full blur-2xl" />
            <span className="text-8xl font-black italic text-cyan-200">?</span>
          </motion.div>
          <h2 className="mt-12 text-5xl font-bold animate-bounce text-cyan-400 drop-shadow-lg">בוחר קורבן...</h2>
        </div>
      )}

      {/* --- SPOTLIGHT --- */}
      {gameState === "spotlight" && selectedPlayer && (
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.5, opacity: 0 }} className="flex flex-col items-center justify-center h-full z-20 relative">
            <div className="relative">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }} className="absolute -inset-10 bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 rounded-full blur-2xl opacity-50" />
                <div className={`relative w-64 h-64 md:w-80 md:h-80 rounded-full border-8 border-white shadow-[0_0_50px_rgba(255,255,255,0.5)] overflow-hidden z-10`}>
                    {selectedPlayer.avatar.startsWith('bg-') ? <div className={`w-full h-full ${selectedPlayer.avatar}`} /> : <img src={selectedPlayer.avatar} alt={selectedPlayer.name} className="w-full h-full object-cover" />}
                </div>
                <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="absolute -bottom-6 left-1/2 -translate-x-1/2 z-20 bg-pink-600 text-white px-8 py-2 rounded-full font-black text-2xl uppercase tracking-widest shadow-xl border-4 border-black whitespace-nowrap">
                    {selectedPlayer.name}
                </motion.div>
            </div>
            <motion.h2 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-16 text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 drop-shadow-sm">
                {selectedPlayer.gender === 'female' ? 'תתכונני!' : 'תתכונן!'}
            </motion.h2>
        </motion.div>
      )}

      {/* --- REVEALING --- */}
      {gameState === "revealing" && (
          <div className="flex flex-col items-center justify-center h-full z-10">
              <Sparkles className="w-20 h-20 text-purple-400 animate-pulse mb-6" />
              <h2 className="text-4xl font-bold text-purple-300">ה-AI רוקח משימה...</h2>
              <div className="mt-4 flex gap-2">
                  <div className="w-3 h-3 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                  <div className="w-3 h-3 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  <div className="w-3 h-3 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
              </div>
          </div>
      )}

      {/* --- CHALLENGE VIEW --- */}
      {gameState === "challenge" && currentChallenge && selectedPlayer && (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center justify-center h-full z-20 relative px-4 max-w-5xl mx-auto w-full">
          {/* Spiciness Indicator */}
          <div className="absolute top-10 right-10 flex flex-col gap-2 items-center bg-black/40 p-4 rounded-xl backdrop-blur-sm border border-white/10">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">רמת חריפות</span>
            <div className="flex gap-1">
                {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className={`w-2 h-8 rounded-sm transition-all duration-500 ${i < currentChallenge.spiciness ? 'bg-gradient-to-t from-red-600 to-orange-400 shadow-[0_0_10px_red]' : 'bg-gray-800'}`} />
                ))}
            </div>
          </div>

          <div className="text-center mb-6">
            <h2 className="text-4xl font-bold text-white mt-4 inline-flex items-center gap-3">
                <span className="text-gray-400 text-2xl">המשימה של</span> {selectedPlayer.name}
            </h2>
            <h3 className={`text-6xl font-black uppercase tracking-widest mt-2 ${challengeType === 'אמת' ? 'text-blue-400 drop-shadow-[0_0_20px_rgba(59,130,246,0.6)]' : 'text-pink-500 drop-shadow-[0_0_10px_rgba(236,72,153,0.6)]'}`}>
              {challengeType}
            </h3>
          </div>

          {/* Challenge Card */}
          <motion.div 
            className="bg-black/60 backdrop-blur-xl border-2 p-10 md:p-14 rounded-[3rem] w-full text-center relative overflow-hidden shadow-2xl min-h-[300px] flex items-center justify-center max-w-4xl flex-col"
            style={{ borderColor: currentChallenge.themeColor }}
          >
             <div className="absolute inset-0 opacity-10 bg-gradient-to-br from-transparent to-current" style={{ color: currentChallenge.themeColor }} />
             
             <p className="text-3xl md:text-5xl font-bold leading-tight drop-shadow-lg text-white mb-4" style={{ direction: "rtl", lineHeight: 1.3 }}>
               {currentChallenge.content}
             </p>

             {/* Voting Meter */}
             <div className="w-full bg-gray-800/50 h-3 rounded-full mt-8 overflow-hidden flex shadow-inner border border-white/5">
                  <div className="bg-green-500 h-full transition-all duration-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" style={{ width: `${(votes.likes / Math.max(1, players.length-1)) * 100}%` }} />
                  <div className="bg-red-500 h-full transition-all duration-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" style={{ width: `${(votes.dislikes / Math.max(1, players.length-1)) * 100}%` }} />
             </div>
             <div className="flex justify-between w-full text-sm font-bold text-gray-300 mt-2 px-2">
                  <span className="flex items-center gap-1 text-green-400"><ThumbsUp size={14}/> {votes.likes}</span>
                  <span className="flex items-center gap-1 text-red-400">{votes.dislikes} <ThumbsDown size={14}/></span>
             </div>

             {currentChallenge.usedModel && (
                 <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 text-[10px] text-gray-500 uppercase tracking-widest opacity-50">
                     <Cpu size={10} /> <span>Generated by {currentChallenge.usedModel}</span>
                 </div>
             )}
          </motion.div>

          <div className="flex gap-8 mt-12 w-full justify-center opacity-50">
             <div className="text-center text-sm text-gray-400 font-bold">השליטה כרגע אצל {selectedPlayer.name} בטלפון 📱</div>
          </div>
        </motion.div>
      )}

      {/* --- PENALTY (Auto-Skip) --- */}
      {gameState === "penalty" && (
        <motion.div 
          className="absolute inset-0 z-50 bg-red-900/95 flex flex-col items-center justify-center overflow-hidden"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        >
           <motion.div animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 0.5 }} className="text-9xl mb-8">
             🥃
           </motion.div>
           <h1 className="text-8xl font-black text-white border-8 border-white p-12 uppercase tracking-tighter transform -rotate-6 shadow-[0_0_50px_rgba(255,0,0,0.8)] bg-red-600">
             שוט חובה!
           </h1>
           <p className="text-5xl text-white mt-12 font-bold animate-pulse text-center px-4">
             {selectedPlayer?.name} ויתר/ה ושותה!
           </p>
           
           {/* Progress bar to auto-reset */}
           <div className="mt-16 w-64 h-2 bg-red-800 rounded-full overflow-hidden">
               <motion.div 
                  initial={{ width: 0 }} 
                  animate={{ width: "100%" }} 
                  transition={{ duration: 5, ease: "linear" }} 
                  className="h-full bg-white" 
               />
           </div>
           <p className="text-sm text-red-300 mt-2 font-bold">ממשיכים מיד...</p>
        </motion.div>
      )}
    </main>
  );
}