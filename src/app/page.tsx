"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Flame, 
  CheckCircle, 
  XCircle,
  Trash2,
  LogOut,
  User as UserIcon,
  WifiOff,
  RefreshCw,
  Sparkles
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
};

export default function TruthOrDareGame() {
  // --- State ---
  const [gameState, setGameState] = useState<"lobby" | "spinning" | "spotlight" | "revealing" | "challenge" | "penalty">("lobby");
  const [players, setPlayers] = useState<Player[]>([]);
  const [heatLevel, setHeatLevel] = useState<number>(1);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [challengeType, setChallengeType] = useState<"אמת" | "חובה" | null>(null);
  const [currentChallenge, setCurrentChallenge] = useState<Challenge | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");
  
  // Auth & Connection State
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(true);

  // --- Realtime Players Listener & Auth Listener ---
  useEffect(() => {
    let channel: RealtimeChannel | null = null;

    const loadHostPlayers = async (userId: string) => {
        const { data, error } = await supabase
          .from('players')
          .select('*')
          .eq('host_id', userId)
          .order('created_at', { ascending: true });
        
        if (error) {
            console.error("Supabase Load Error:", error);
            setIsConnected(false);
        } else {
            setPlayers(data as Player[]);
            setIsConnected(true);
        }
    };

    const subscribeToRoom = (userId: string) => {
        if (channel) supabase.removeChannel(channel);
        
        channel = supabase
          .channel(`room_${userId}`)
          .on(
            'postgres_changes', 
            { 
              event: 'INSERT', 
              schema: 'public', 
              table: 'players',
              filter: `host_id=eq.${userId}` 
            }, 
            (payload) => {
              const newPlayer = payload.new as Player;
              setPlayers((prev) => [...prev, newPlayer]);
            }
          )
          .on(
            'postgres_changes', 
            { 
              event: 'DELETE', 
              schema: 'public', 
              table: 'players',
              filter: `host_id=eq.${userId}`
            }, 
            (payload) => {
              setPlayers((prev) => prev.filter(p => p.id !== payload.old.id));
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') setIsConnected(true);
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setIsConnected(false);
          });
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
            setAuthUser(session.user);
            if (typeof window !== "undefined") {
                setJoinUrl(`${window.location.origin}/join?hostId=${session.user.id}`);
            }
            loadHostPlayers(session.user.id);
            subscribeToRoom(session.user.id);
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
  }, []);

  const handleManualRefresh = async () => {
      if (!authUser) return;
      const { data } = await supabase
          .from('players')
          .select('*')
          .eq('host_id', authUser.id)
          .order('created_at', { ascending: true });
      if (data) {
          setPlayers(data as Player[]);
      }
  };

  // --- Audio placeholders ---
  const playSpinSound = () => { /* Play spin.mp3 */ };
  const playWinSound = () => { /* Play win.mp3 */ };
  const playShotSound = () => { /* Play shot.mp3 */ };

  const handleHeatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHeatLevel(parseInt(e.target.value));
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const resetGame = async () => {
    if (!authUser) return;
    if (confirm("בטוח שאתה רוצה לאפס את המשחק ולמחוק את כל השחקנים וההיסטוריה?")) {
        // מחיקת שחקנים
        const { error: playersError } = await supabase
          .from('players')
          .delete()
          .eq('host_id', authUser.id);
        
        // מחיקת היסטוריה
        const { error: historyError } = await supabase
          .from('challenge_history')
          .delete()
          .eq('host_id', authUser.id);
          
        if (playersError || historyError) console.error("Error resetting:", playersError || historyError);
        setPlayers([]); 
    }
  };

  const spinTheWheel = () => {
    if (players.length < 2) return alert("צריך לפחות 2 שחקנים!");
    setGameState("spinning");
    playSpinSound();
    
    setTimeout(() => {
      const randomPlayer = players[Math.floor(Math.random() * players.length)];
      setSelectedPlayer(randomPlayer);
      const type = Math.random() > 0.5 ? "אמת" : "חובה";
      setChallengeType(type);
      
      // שלב הזרקור
      setGameState("spotlight");
    }, 3000);
  };

  // מעבר אוטומטי מזרקור לחשיפה
  useEffect(() => {
      if (gameState === "spotlight") {
          const timer = setTimeout(() => {
              setGameState("revealing");
          }, 2500);
          return () => clearTimeout(timer);
      }
  }, [gameState]);

  // --- יצירת אתגר ע"י Gemini עם היסטוריה מהדאטהבייס ---
  useEffect(() => {
    if (gameState === "revealing" && selectedPlayer && challengeType && authUser) {
      const fetchChallenge = async () => {
        setLoadingAI(true);
        try {
          // 1. שליפת היסטוריה מהדאטהבייס עבור השחקן הספציפי
          const { data: historyData } = await supabase
            .from('challenge_history')
            .select('challenge_text')
            .eq('host_id', authUser.id)
            .eq('player_id', selectedPlayer.id);

          // המרת התוצאות למערך מחרוזות פשוט
          const playerPrevTasks = historyData?.map(h => h.challenge_text) || [];

          // 2. קריאה ל-AI
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
          
          // 3. שמירת האתגר החדש לדאטהבייס כדי שלא יחזור בעתיד
          if (data.content) {
              await supabase.from('challenge_history').insert({
                  host_id: authUser.id,
                  player_id: selectedPlayer.id,
                  challenge_text: data.content,
                  type: challengeType
              });
          }

          setGameState("challenge");
          playWinSound();
        } catch (error) {
          console.error("AI/DB Error", error);
          setCurrentChallenge({
             content: "ה-AI התעייף... תעשה שוט!",
             spiciness: 1,
             themeColor: "#ff0000"
          });
          setGameState("challenge");
        } finally {
          setLoadingAI(false);
        }
      };
      fetchChallenge();
    }
  }, [gameState]); // התלות רק ב-gameState מונעת לולאות אינסופיות

  const handleDone = () => {
    confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 }, colors: ['#ff00ff', '#00ffff', '#ffff00'] });
    setTimeout(() => setGameState("lobby"), 2500);
  };

  const handleSkip = () => {
    setGameState("penalty");
    playShotSound();
  };

  return (
    <main className="min-h-screen bg-black text-white font-sans overflow-hidden relative selection:bg-pink-500" dir="rtl">
      {/* רקע ואווירה */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-black to-black z-0 pointer-events-none" />
      <div className={`absolute inset-0 transition-opacity duration-1000 z-0 opacity-30 ${heatLevel > 7 ? 'bg-red-900/20' : 'bg-transparent'}`} />

      {/* --- סטטוס חיבור ומשתמש --- */}
      <div className="absolute top-4 left-4 z-50 flex flex-col gap-2 items-end ltr">
        {authUser ? (
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/20">
                <button onClick={handleManualRefresh} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-400" title="רענן רשימה">
                    <RefreshCw size={16} />
                </button>
                <button onClick={handleLogout} className="p-2 hover:bg-red-500/20 rounded-full transition-colors text-red-400" title="התנתק">
                    <LogOut size={16} />
                </button>
                <div className="flex flex-col text-xs text-right">
                    <span className="text-gray-400">מחובר כ:</span>
                    <span className="font-bold text-white">{authUser.email?.split('@')[0]}</span>
                </div>
            </div>
        ) : (
            <Link href="/login" className="flex items-center gap-2 bg-pink-600 hover:bg-pink-500 px-4 py-2 rounded-full font-bold text-sm transition-colors shadow-lg">
                <UserIcon size={16} />
                התחברות למארח
            </Link>
        )}

        {!isConnected && (
             <div className="flex items-center gap-2 bg-red-900/80 backdrop-blur-md px-4 py-1 rounded-full border border-red-500/50 text-red-200 text-xs font-bold animate-pulse">
                <WifiOff size={14} />
                מנותק מ-Supabase
             </div>
        )}
      </div>

      {/* --- LOBBY VIEW --- */}
      {gameState === "lobby" && (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          className="relative z-10 flex flex-col items-center justify-center h-screen space-y-8"
        >
          <h1 className="text-8xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 drop-shadow-[0_0_25px_rgba(236,72,153,0.6)] text-center tracking-tighter">
            אמת או חובה <br/> <span className="text-4xl text-white font-light tracking-widest opacity-80">AI EDITION</span>
          </h1>

          {/* מעגל שחקנים */}
          <div className="flex flex-wrap gap-6 justify-center items-center min-h-[120px] px-10">
            {players.length === 0 ? (
              <div className="text-gray-500 text-2xl animate-pulse font-bold">
                {authUser ? "ממתין לשחקנים... סרקו את הקוד" : "נא להתחבר כדי להתחיל משחק"}
              </div>
            ) : (
              players.map((p) => (
                <motion.div 
                  key={p.id}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex flex-col items-center gap-2 group"
                >
                    <div className={`w-24 h-24 rounded-full border-4 border-white/30 group-hover:border-pink-500 transition-colors overflow-hidden shadow-[0_0_20px_rgba(255,255,255,0.2)]`}>
                       {p.avatar.startsWith('bg-') ? (
                          <div className={`w-full h-full ${p.avatar}`} />
                       ) : (
                          <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                       )}
                    </div>
                    <span className="font-bold text-lg text-white drop-shadow-md">{p.name}</span>
                </motion.div>
              ))
            )}
          </div>

          {/* לוח בקרה */}
          <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[2rem] border border-white/10 w-full max-w-3xl shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <span className="text-cyan-400 font-bold text-xl flex items-center gap-2"><Flame className="fill-cyan-400" /> רמת חום: {heatLevel}</span>
              <span className="text-sm font-bold text-gray-300 bg-white/10 px-3 py-1 rounded-lg border border-white/10">
                {heatLevel < 4 ? "משעשע וקליל 😇" : heatLevel < 8 ? "לוהט ונועז 🔥" : "למבוגרים בלבד 🔞"}
              </span>
            </div>
            <input 
              type="range" 
              min="1" 
              max="10" 
              value={heatLevel} 
              onChange={handleHeatChange}
              className="w-full h-4 bg-gray-800 rounded-full appearance-none cursor-pointer accent-pink-500 hover:accent-pink-400 transition-all shadow-inner"
            />
            
            <div className="mt-10 flex justify-center gap-6">
              <button 
                onClick={resetGame}
                disabled={!authUser}
                className="px-6 py-4 bg-red-900/30 hover:bg-red-800/80 border border-red-500/30 rounded-2xl flex items-center gap-2 transition text-sm disabled:opacity-30 text-red-200"
                title="איפוס משחק ומחיקת שחקנים"
              >
                <Trash2 size={20} /> איתחול
              </button>
              
              <button 
                onClick={spinTheWheel}
                disabled={players.length < 2 || !authUser}
                className="flex-1 px-12 py-5 bg-gradient-to-r from-pink-600 to-purple-600 rounded-2xl font-black text-3xl hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_40px_rgba(236,72,153,0.5)] disabled:opacity-50 disabled:shadow-none text-white tracking-widest border border-white/20"
              >
                סובב את זה!
              </button>
            </div>
          </div>

          {/* QR Code */}
          <div className="absolute bottom-10 right-10 bg-white p-4 rounded-2xl opacity-90 shadow-[0_0_30px_rgba(255,255,255,0.2)] flex flex-col items-center gap-2 transform rotate-2 hover:rotate-0 transition-transform duration-300 hover:scale-110 cursor-none">
             {authUser && joinUrl ? (
                <div style={{ height: "auto", maxWidth: "140px", width: "100%" }}>
                  <QRCode
                    size={256}
                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                    value={joinUrl}
                    viewBox={`0 0 256 256`}
                  />
                </div>
             ) : (
               <div className="w-[140px] h-[140px] bg-gray-200 flex items-center justify-center text-black text-sm text-center p-2 font-bold rounded-lg">
                 {authUser ? "טוען קוד..." : "התחבר להצגת קוד"}
               </div>
             )}
            <p className="text-black text-xs font-black tracking-widest uppercase mt-1">סרוק להצטרפות</p>
          </div>
        </motion.div>
      )}

      {/* --- SPINNING --- */}
      {gameState === "spinning" && (
        <div className="flex flex-col items-center justify-center h-screen z-10 relative">
          <motion.div
            animate={{ rotate: 360 * 10 }}
            transition={{ duration: 3, ease: "circOut" }}
            className="w-80 h-80 rounded-full border-8 border-dashed border-cyan-500/50 flex items-center justify-center relative shadow-[0_0_100px_rgba(6,182,212,0.4)]"
          >
            <div className="absolute inset-0 bg-cyan-500/10 rounded-full blur-2xl" />
            <span className="text-8xl font-black italic text-cyan-200">?</span>
          </motion.div>
          <h2 className="mt-12 text-5xl font-bold animate-bounce text-cyan-400 drop-shadow-lg">
            בוחר קורבן...
          </h2>
        </div>
      )}

      {/* --- SPOTLIGHT VIEW --- */}
      {gameState === "spotlight" && selectedPlayer && (
        <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.5, opacity: 0 }}
            className="flex flex-col items-center justify-center h-screen z-20 relative"
        >
            <div className="relative">
                <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    className="absolute -inset-10 bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 rounded-full blur-2xl opacity-50"
                />
                
                <div className={`relative w-64 h-64 md:w-96 md:h-96 rounded-full border-8 border-white shadow-[0_0_50px_rgba(255,255,255,0.5)] overflow-hidden z-10`}>
                    {selectedPlayer.avatar.startsWith('bg-') ? (
                        <div className={`w-full h-full ${selectedPlayer.avatar}`} />
                    ) : (
                        <img src={selectedPlayer.avatar} alt={selectedPlayer.name} className="w-full h-full object-cover" />
                    )}
                </div>
                
                <motion.div 
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="absolute -bottom-6 left-1/2 -translate-x-1/2 z-20 bg-pink-600 text-white px-8 py-2 rounded-full font-black text-2xl uppercase tracking-widest shadow-xl border-4 border-black"
                >
                    {selectedPlayer.name}
                </motion.div>
            </div>

            <motion.h2 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-16 text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 drop-shadow-sm"
            >
                תתכונן!
            </motion.h2>
        </motion.div>
      )}

      {/* --- REVEALING AI --- */}
      {gameState === "revealing" && (
          <div className="flex flex-col items-center justify-center h-screen z-10">
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
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center justify-center h-screen z-20 relative px-4 max-w-5xl mx-auto"
        >
          {/* Spiciness Indicator */}
          <div className="absolute top-10 right-10 flex flex-col gap-2 items-center bg-black/40 p-4 rounded-xl backdrop-blur-sm border border-white/10">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">רמת חריפות</span>
            <div className="flex gap-1">
                {Array.from({ length: 10 }).map((_, i) => (
                <div 
                    key={i} 
                    className={`w-2 h-8 rounded-sm transition-all duration-500 ${i < currentChallenge.spiciness ? 'bg-gradient-to-t from-red-600 to-orange-400 shadow-[0_0_10px_red]' : 'bg-gray-800'}`} 
                />
                ))}
            </div>
          </div>

          <div className="text-center mb-8">
            <div className="inline-block relative">
                <div className={`w-28 h-28 rounded-full border-4 border-white shadow-xl overflow-hidden`}>
                {selectedPlayer.avatar.startsWith('bg-') ? (
                    <div className={`w-full h-full ${selectedPlayer.avatar}`} />
                ) : (
                    <img src={selectedPlayer.avatar} alt={selectedPlayer.name} className="w-full h-full object-cover" />
                )}
                </div>
            </div>
            <h2 className="text-4xl font-bold text-white mt-4">{selectedPlayer.name}</h2>
            <h3 className={`text-6xl font-black uppercase tracking-widest mt-2 ${challengeType === 'אמת' ? 'text-blue-400 drop-shadow-[0_0_20px_rgba(59,130,246,0.6)]' : 'text-pink-500 drop-shadow-[0_0_20px_rgba(236,72,153,0.6)]'}`}>
              {challengeType}
            </h3>
          </div>

          {/* כרטיס המשימה */}
          <motion.div 
            className="bg-black/60 backdrop-blur-xl border-2 p-10 md:p-14 rounded-[3rem] w-full text-center relative overflow-hidden shadow-2xl min-h-[350px] flex items-center justify-center max-w-4xl"
            style={{ borderColor: currentChallenge.themeColor }}
          >
             <div className="absolute inset-0 opacity-10 bg-gradient-to-br from-transparent to-current" style={{ color: currentChallenge.themeColor }} />
             
             <p className="text-3xl md:text-5xl font-bold leading-tight drop-shadow-lg text-white" style={{ direction: "rtl", lineHeight: 1.3 }}>
               {currentChallenge.content}
             </p>
          </motion.div>

          <div className="flex gap-8 mt-12 w-full justify-center">
            <button onClick={handleSkip} className="group flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center group-hover:bg-red-600 transition-colors border-2 border-transparent group-hover:border-red-400 shadow-lg">
                <XCircle size={36} className="text-gray-400 group-hover:text-white" />
              </div>
              <span className="font-bold text-gray-400 group-hover:text-white text-sm">דלג (שוט)</span>
            </button>

            <button onClick={handleDone} className="group flex flex-col items-center gap-2">
              <div className="w-24 h-24 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.5)] group-hover:scale-110 transition-transform border-4 border-white/20">
                <CheckCircle size={48} className="text-white" />
              </div>
              <span className="font-bold text-green-400 group-hover:text-green-300 text-lg">בוצע!</span>
            </button>
          </div>
        </motion.div>
      )}

      {/* --- PENALTY (SHOT) VIEW --- */}
      {gameState === "penalty" && (
        <motion.div 
          className="absolute inset-0 z-50 bg-red-900/95 flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
           <motion.div 
             animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
             transition={{ repeat: Infinity, duration: 0.5 }}
             className="text-9xl mb-8"
           >
             🥃
           </motion.div>
           <h1 className="text-8xl font-black text-white border-8 border-white p-12 uppercase tracking-tighter transform -rotate-6 shadow-[0_0_50px_rgba(255,0,0,0.8)] bg-red-600">
             שוט חובה!
           </h1>
           <p className="text-5xl text-white mt-12 font-bold animate-pulse text-center px-4">
             {selectedPlayer?.name} חייב/ת לשתות!
           </p>
           <button 
             onClick={() => setGameState("lobby")}
             className="mt-16 px-12 py-4 bg-white text-red-900 font-black text-2xl rounded-full hover:bg-gray-200 shadow-xl transition-transform hover:scale-105"
           >
             המשך למשחק
           </button>
        </motion.div>
      )}

    </main>
  );
}