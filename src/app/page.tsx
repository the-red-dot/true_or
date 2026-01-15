"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Flame, 
  CheckCircle, 
  XCircle,
  Trash2,
  LogOut,
  User as UserIcon,
  WifiOff,
  RefreshCw,
  Sparkles,
  Cpu, 
  Beer,
  ThumbsUp,
  ThumbsDown,
  LogIn
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

type Reaction = { id: string; emoji: string; playerId: string; };

export default function TruthOrDareGame() {
  // --- State ---
  const [gameState, setGameState] = useState<"lobby" | "waiting_for_spin" | "spinning" | "spotlight" | "revealing" | "challenge" | "penalty">("lobby");
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

  // --- Interactive State ---
  const [reactions, setReactions] = useState<Reaction[]>([]); 
  const [votes, setVotes] = useState<{likes: number, dislikes: number, shots: number}>({likes: 0, dislikes: 0, shots: 0});
  const [shotVoteMode, setShotVoteMode] = useState(false);

  // --- Sync Game State to DB ---
  const syncGameStateToDB = async (status: string, currentPlayerId: string | null = null, challenge: any = null) => {
      if (!authUser) return;
      
      // בלובי, השחקן הראשון (players[0]) הוא זה שמקבל את השליטה להתחיל
      let activeControllerId = lastActivePlayer?.id;
      if (status === 'lobby' && players.length > 0) {
          activeControllerId = players[0].id;
      }

      await supabase.from('game_states').upsert({
          host_id: authUser.id,
          status: status,
          current_player_id: currentPlayerId,
          last_active_player_id: activeControllerId, // סנכרון מי השולט בטלפון
          heat_level: heatLevel,
          challenge_text: challenge?.content || null,
          challenge_type: challengeType,
          updated_at: new Date().toISOString()
      });
  };

  useEffect(() => {
      syncGameStateToDB(gameState, selectedPlayer?.id, currentChallenge);
      if (gameState !== 'challenge') {
          setVotes({likes: 0, dislikes: 0, shots: 0});
      }
  }, [gameState, selectedPlayer, currentChallenge, heatLevel, lastActivePlayer, players]); 

  // --- Realtime Listeners ---
  useEffect(() => {
    let channel: RealtimeChannel | null = null;

    const setupRealtime = async (userId: string) => {
        const { data } = await supabase.from('players').select('*').eq('host_id', userId).order('created_at', { ascending: true });
        if (data) setPlayers(data as Player[]);

        channel = supabase.channel(`room_${userId}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: `host_id=eq.${userId}` }, 
             (payload) => setPlayers(prev => [...prev, payload.new as Player]))
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'players', filter: `host_id=eq.${userId}` }, 
             (payload) => setPlayers(prev => prev.filter(p => p.id !== payload.old.id)))
          .on('broadcast', { event: 'game_event' }, (event) => handleGameEvent(event.payload))
          .subscribe((status) => setIsConnected(status === 'SUBSCRIBED'));
    };

    const handleGameEvent = (data: any) => {
        const { type, payload, playerId } = data;
        
        if (type === 'emoji') {
            const id = Math.random().toString(36);
            setReactions(prev => [...prev, { id, emoji: payload, playerId }]);
            setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 2000);
        }
        if (type === 'update_heat') setHeatLevel(payload);
        if (type === 'trigger_spin') spinTheWheel(); 
        if (type === 'action_skip') handleSkip(); 
        if (type === 'vote_like') setVotes(v => ({ ...v, likes: v.likes + 1 }));
        if (type === 'vote_dislike') setVotes(v => ({ ...v, dislikes: v.dislikes + 1 }));
        if (type === 'vote_shot') {
             setVotes(v => {
                 const newShots = v.shots + 1;
                 if (newShots > Math.max(1, players.length * 0.4)) triggerGroupShot();
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
            setJoinUrl(""); 
            if (channel) supabase.removeChannel(channel);
        }
    });

    return () => { authListener.subscription.unsubscribe(); if (channel) supabase.removeChannel(channel); };
  }, [players.length]); 

  // הצבעות אוטומטיות
  useEffect(() => {
      if (gameState !== 'challenge') return;
      const voters = Math.max(1, players.length - 1);
      if (votes.likes > voters * 0.5) handleDone();
      else if (votes.dislikes > voters * 0.5) handleSkip();
  }, [votes, players.length, gameState]);

  // --- Game Flow ---

  const spinTheWheel = () => {
    if (players.length < 2) return alert("צריך לפחות 2 שחקנים!");
    setGameState("spinning");
    playSpinSound();
    
    setTimeout(() => {
      const randomPlayer = players[Math.floor(Math.random() * players.length)];
      setSelectedPlayer(randomPlayer);
      setChallengeType(Math.random() > 0.5 ? "אמת" : "חובה");
      setGameState("spotlight");
    }, 3000);
  };

  useEffect(() => {
      if (gameState === "spotlight") {
          const t = setTimeout(() => setGameState("revealing"), 2500);
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
              previousChallenges: prevTasks
            }),
      })
      .then(res => res.json())
      .then(data => {
          setCurrentChallenge(data);
          setGameState("challenge");
      })
      .catch(() => setGameState("challenge"))
      .finally(() => setLoadingAI(false));
    }
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
      const { data } = await supabase.from('players').select('*').eq('host_id', authUser.id).order('created_at', { ascending: true });
      if (data) setPlayers(data as Player[]);
  };

  const handleLogout = async () => {
      if (confirm("האם אתה בטוח שברצונך להתנתק? זה יסגור את החדר.")) {
          await supabase.auth.signOut();
      }
  };
  
  const resetGame = async () => {
    if (!authUser) return;
    if (confirm("בטוח שאתה רוצה לאפס את המשחק ולמחוק את כל השחקנים?")) {
        await supabase.from('players').delete().eq('host_id', authUser.id);
        await supabase.from('challenge_history').delete().eq('host_id', authUser.id);
        setPlayers([]); 
    }
  };
  
  const handleHeatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHeatLevel(parseInt(e.target.value));
  };

  const playSpinSound = () => { /* Play spin.mp3 */ };
  const playWinSound = () => { /* Play win.mp3 */ };
  const playShotSound = () => { /* Play shot.mp3 */ };

  return (
    <main className="h-screen w-full bg-black text-white font-sans overflow-hidden relative selection:bg-pink-500 flex flex-col" dir="rtl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-black to-black z-0 pointer-events-none" />
      
      {/* Top Bar - מופיע רק אם מחוברים */}
      {authUser && (
        <div className="absolute top-6 left-6 z-50 flex items-center gap-4 bg-black/40 backdrop-blur px-4 py-2 rounded-full border border-white/10">
            <div className="flex flex-col text-left">
                <span className="text-xs text-gray-400 font-bold uppercase">קוד חדר</span>
                <span className="text-xl font-mono text-pink-500 tracking-widest">{authUser.email?.split('@')[0] || '...'}</span>
            </div>
            <div className="h-8 w-px bg-white/20"></div>
            <div className="flex items-center gap-2">
                <UserIcon size={16} /> {players.length}
            </div>
            <button onClick={handleManualRefresh} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-400"><RefreshCw size={16} /></button>
            <button onClick={handleLogout} className="p-2 hover:bg-red-500/20 rounded-full transition-colors text-red-400" title="התנתק"><LogOut size={16} /></button>
            {!isConnected && <WifiOff className="text-red-500 animate-pulse" />}
        </div>
      )}

      {/* --- Main Game Area --- */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 p-10 h-full">
          
          {/* מצב מנותק */}
          {!authUser && (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center text-center space-y-8 p-10 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-xl">
                  <div className="bg-pink-600/20 p-6 rounded-full">
                      <Trash2 className="w-20 h-20 text-pink-500 opacity-50" />
                  </div>
                  <h1 className="text-5xl font-black">המשחק נותק</h1>
                  <p className="text-xl text-gray-400 max-w-md">כדי לייצר קוד QR ולהתחיל משחק חדש, עליך להתחבר כמארח.</p>
                  <Link href="/login" className="px-10 py-5 bg-gradient-to-r from-pink-600 to-purple-600 rounded-2xl font-bold text-2xl shadow-xl hover:scale-105 transition-transform flex items-center gap-4">
                      <LogIn size={32} /> התחבר מחדש
                  </Link>
              </motion.div>
          )}

          {/* LOBBY & WAITING - Big Player Circle (רק כשמחוברים) */}
          {authUser && (gameState === "lobby" || gameState === "waiting_for_spin") && (
            <div className="flex flex-col items-center w-full max-w-6xl h-full justify-center">
                <h1 className="text-8xl md:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 drop-shadow-[0_0_30px_rgba(236,72,153,0.5)] mb-12 tracking-tighter">
                    {gameState === 'lobby' ? 'אמת או חובה' : 'הבא בתור...'}
                </h1>

                <div className="flex flex-wrap justify-center gap-8 px-4">
                    {players.length === 0 && (
                        <div className="text-2xl text-gray-500 animate-pulse">ממתין לשחקנים... סרקו את הקוד</div>
                    )}
                    {players.map((p, index) => {
                        const playerReactions = reactions.filter(r => r.playerId === p.id);
                        const isFirstPlayer = gameState === 'lobby' && index === 0;
                        const isLastActive = gameState === 'waiting_for_spin' && lastActivePlayer?.id === p.id;
                        const isController = isFirstPlayer || isLastActive;

                        return (
                            <div key={p.id} className="relative group">
                                <AnimatePresence>
                                    {playerReactions.map(r => (
                                        <motion.div 
                                            key={r.id}
                                            initial={{ opacity: 0, scale: 0, y: 0 }}
                                            animate={{ opacity: 1, scale: 1.5, y: -100 }}
                                            exit={{ opacity: 0, scale: 0, y: -120 }}
                                            transition={{ duration: 1.5 }}
                                            className="absolute -top-10 left-1/2 -translate-x-1/2 text-5xl z-50 pointer-events-none drop-shadow-2xl"
                                        >
                                            {r.emoji}
                                        </motion.div>
                                    ))}
                                </AnimatePresence>

                                <div className={`w-28 h-28 rounded-full border-4 overflow-hidden transition-all duration-300 relative ${isController ? 'border-yellow-400 shadow-[0_0_40px_rgba(250,204,21,0.6)] scale-110' : 'border-white/20'}`}>
                                    {p.avatar.startsWith('bg-') ? <div className={`w-full h-full ${p.avatar}`} /> : <img src={p.avatar} className="w-full h-full object-cover" />}
                                    {isController && <div className="absolute inset-0 bg-black/30 flex items-center justify-center"><RefreshCw className="text-white w-10 h-10 animate-spin-slow" /></div>}
                                </div>
                                <div className="text-center mt-2 font-bold text-lg drop-shadow-md">{p.name}</div>
                                {isController && <div className="text-center text-yellow-400 text-xs font-bold animate-pulse">{gameState === 'lobby' ? 'מתחיל...' : 'מסובב...'}</div>}
                            </div>
                        );
                    })}
                </div>

                {/* שליטה ידנית למארח (גיבוי) */}
                <div className="mt-12 bg-white/5 backdrop-blur-xl p-4 rounded-2xl border border-white/10 flex items-center gap-6">
                    <span className="text-cyan-400 font-bold flex items-center gap-2"><Flame /> {heatLevel}</span>
                    <input type="range" min="1" max="10" value={heatLevel} onChange={handleHeatChange} className="w-32 accent-pink-500" />
                    <button onClick={resetGame} className="p-2 hover:bg-red-900/50 rounded-lg text-red-400" title="איפוס משחק"><Trash2 size={20}/></button>
                </div>

            </div>
          )}

          {/* SPINNING ANIMATION */}
          {authUser && gameState === 'spinning' && (
              <div className="relative">
                  <motion.div animate={{ rotate: 360 * 5 }} transition={{ duration: 3, ease: "circOut" }} className="w-96 h-96 rounded-full border-[12px] border-dashed border-cyan-500/30 flex items-center justify-center">
                      <span className="text-9xl">🎡</span>
                  </motion.div>
              </div>
          )}

          {/* SPOTLIGHT */}
          {authUser && gameState === 'spotlight' && selectedPlayer && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-center">
                  <div className="w-64 h-64 rounded-full border-8 border-white shadow-[0_0_100px_white] overflow-hidden mx-auto mb-8">
                      <img src={selectedPlayer.avatar} className="w-full h-full object-cover" />
                  </div>
                  <h2 className="text-7xl font-black text-white">{selectedPlayer.gender === 'female' ? 'תתכונני!' : 'תתכונן!'}</h2>
              </motion.div>
          )}

          {/* CHALLENGE CARD */}
          {authUser && (gameState === 'challenge' || gameState === 'revealing') && currentChallenge && selectedPlayer && (
              <div className="flex flex-col items-center justify-between h-full w-full py-10">
                  {/* Card */}
                  <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full max-w-5xl px-4 relative z-20">
                      <div className="bg-gray-900/90 backdrop-blur-xl border border-white/20 p-12 rounded-[3rem] text-center shadow-2xl relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-pink-500 to-cyan-500" />
                          <div className="flex justify-center mb-6">
                              <span className={`text-4xl font-black px-6 py-2 rounded-full ${challengeType === 'אמת' ? 'bg-blue-500/20 text-blue-400' : 'bg-pink-500/20 text-pink-400'}`}>{challengeType}</span>
                          </div>
                          <h3 className="text-5xl md:text-7xl font-black leading-tight mb-8 drop-shadow-lg" style={{ direction: 'rtl' }}>{currentChallenge.content}</h3>
                          
                          {/* Vote Bar */}
                          <div className="flex items-center gap-4 max-w-lg mx-auto bg-black/50 p-2 rounded-full">
                              <ThumbsUp className="text-green-500" />
                              <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden">
                                  <div className="bg-green-500 h-full transition-all duration-300" style={{ width: `${(votes.likes / Math.max(1, players.length-1)) * 100}%` }}></div>
                              </div>
                              <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden flex justify-end">
                                  <div className="bg-red-500 h-full transition-all duration-300" style={{ width: `${(votes.dislikes / Math.max(1, players.length-1)) * 100}%` }}></div>
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

                  {/* Reaction Circle - Small Players */}
                  <div className="flex justify-center gap-4 mt-8 flex-wrap px-10">
                      {players.filter(p => p.id !== selectedPlayer.id).map(p => {
                          const playerReactions = reactions.filter(r => r.playerId === p.id);
                          return (
                              <div key={p.id} className="relative w-20 h-20 rounded-full border-2 border-white/20 opacity-70">
                                  <AnimatePresence>
                                    {playerReactions.map(r => (
                                        <motion.div 
                                            key={r.id} 
                                            initial={{ opacity: 0, scale: 0, y: 0 }} 
                                            animate={{ opacity: 1, scale: 1.5, y: -100 }} 
                                            exit={{ opacity: 0, scale: 0 }} 
                                            transition={{ duration: 1.5 }}
                                            className="absolute -top-4 left-1/2 -translate-x-1/2 text-4xl z-50">
                                                {r.emoji}
                                        </motion.div>
                                    ))}
                                  </AnimatePresence>
                                  {p.avatar.startsWith('bg-') ? <div className={`w-full h-full ${p.avatar}`} /> : <img src={p.avatar} className="w-full h-full object-cover rounded-full" />}
                              </div>
                          );
                      })}
                  </div>
              </div>
          )}

          {/* PENALTY */}
          {gameState === 'penalty' && (
              <motion.div 
                className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-red-900/90"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              >
                  <motion.div animate={{ rotate: [-5, 5, -5] }} transition={{ repeat: Infinity, duration: 0.2 }}>
                      <Beer size={150} className="text-yellow-400 drop-shadow-2xl mb-8" />
                  </motion.div>
                  <h1 className="text-9xl font-black uppercase mb-4 animate-bounce text-white drop-shadow-[0_10px_0_rgba(0,0,0,0.5)]">SHOT!</h1>
                  <p className="text-5xl font-bold text-red-200">{selectedPlayer?.name} ויתר/ה...</p>
                  <p className="text-xl mt-12 animate-pulse text-white/50 font-mono">המשחק ימשיך מיד...</p>
              </motion.div>
          )}

          {/* EVERYONE DRINKS */}
          <AnimatePresence>
            {shotVoteMode && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[100] bg-orange-600 flex flex-col items-center justify-center">
                    <Beer size={200} className="animate-spin mb-8 text-yellow-300" />
                    <h1 className="text-8xl font-black">כולם שותים!</h1>
                </motion.div>
            )}
          </AnimatePresence>
          
          {/* Always Show QR if Joined (Small Corner) */}
           {authUser && joinUrl && gameState !== 'lobby' && (
               <div className="absolute bottom-6 right-6 z-40 bg-white p-2 rounded-lg opacity-80 hover:opacity-100 transition-opacity scale-75 origin-bottom-right">
                   <QRCode value={joinUrl} size={80} />
               </div>
           )}

      </div>
    </main>
  );
}