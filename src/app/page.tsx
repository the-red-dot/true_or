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
  Wifi,
  WifiOff,
  RefreshCw
} from "lucide-react";
import confetti from "canvas-confetti";
import QRCode from "react-qr-code";
// UPDATE: שימוש בנתיב החדש שביקשת
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
  const [gameState, setGameState] = useState<"lobby" | "spinning" | "revealing" | "challenge" | "penalty">("lobby");
  const [players, setPlayers] = useState<Player[]>([]);
  const [heatLevel, setHeatLevel] = useState<number>(1);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [challengeType, setChallengeType] = useState<"Truth" | "Dare" | null>(null);
  const [currentChallenge, setCurrentChallenge] = useState<Challenge | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");
  
  // Auth & Connection State
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(true);

  // --- Realtime Players Listener & Auth Listener ---
  useEffect(() => {
    let channel: RealtimeChannel | null = null;

    // פונקציה לטעינת שחקנים ראשונית
    const loadHostPlayers = async (userId: string) => {
        console.log("Loading players for host:", userId);
        const { data, error } = await supabase
          .from('players')
          .select('*')
          .eq('host_id', userId)
          .order('created_at', { ascending: true });
        
        if (error) {
            console.error("Supabase Load Error:", error);
            setIsConnected(false);
        } else {
            console.log("Players loaded:", data);
            setPlayers(data as Player[]);
            setIsConnected(true);
        }
    };

    // פונקציה להאזנה לשינויים בזמן אמת
    const subscribeToRoom = (userId: string) => {
        // ניקוי ערוץ קודם אם קיים
        if (channel) supabase.removeChannel(channel);

        console.log("Subscribing to realtime room for host:", userId);
        
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
              console.log("New player joined!", payload.new);
              const newPlayer = payload.new as Player;
              setPlayers((prev) => [...prev, newPlayer]);
              playSpinSound(); 
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
              console.log("Player left/deleted", payload.old);
              setPlayers((prev) => prev.filter(p => p.id !== payload.old.id));
            }
          )
          .subscribe((status) => {
            console.log("Subscription status:", status);
            if (status === 'SUBSCRIBED') setIsConnected(true);
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setIsConnected(false);
          });
    };

    // הגדרת מאזין לשינויי התחברות (יציב יותר מ-getUser חד פעמי)
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        console.log("Auth State Changed:", event, session?.user?.id);
        
        if (session?.user) {
            setAuthUser(session.user);
            if (typeof window !== "undefined") {
                setJoinUrl(`${window.location.origin}/join?hostId=${session.user.id}`);
            }
            // טעינה והאזנה
            loadHostPlayers(session.user.id);
            subscribeToRoom(session.user.id);
        } else {
            setAuthUser(null);
            setPlayers([]);
            if (channel) supabase.removeChannel(channel);
        }
    });

    // Cleanup
    return () => {
        authListener.subscription.unsubscribe();
        if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // --- Helper to manually refresh players if realtime lags ---
  const handleManualRefresh = async () => {
      if (!authUser) return;
      const { data, error } = await supabase
          .from('players')
          .select('*')
          .eq('host_id', authUser.id)
          .order('created_at', { ascending: true });
      if (data) {
          setPlayers(data as Player[]);
          alert("רשימת השחקנים רעננה!");
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
    // ה-Auth Listener יטפל בניקוי ה-State
  };

  const resetGame = async () => {
    if (!authUser) return;
    if (confirm("בטוח שאתה רוצה לאפס את המשחק ולמחוק את כל השחקנים?")) {
        const { error } = await supabase
          .from('players')
          .delete()
          .eq('host_id', authUser.id);
          
        if (error) console.error("Error resetting:", error);
        // ה-Realtime יעדכן את המחיקה, אבל ליתר ביטחון ננקה לוקאלית
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
      const type = Math.random() > 0.5 ? "Truth" : "Dare";
      setChallengeType(type);
      setGameState("revealing");
    }, 3000);
  };

  // --- Generate Challenge via Gemini ---
  useEffect(() => {
    if (gameState === "revealing" && selectedPlayer && challengeType) {
      const fetchChallenge = async () => {
        setLoadingAI(true);
        try {
          const res = await fetch("/api/generate", {
            method: "POST",
            body: JSON.stringify({
              playerName: selectedPlayer.name,
              playerGender: selectedPlayer.gender,
              heatLevel: heatLevel,
              type: challengeType
            }),
          });
          const data = await res.json();
          setCurrentChallenge(data);
          setGameState("challenge");
          playWinSound();
        } catch (error) {
          console.error("AI Error", error);
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
  }, [gameState, selectedPlayer, challengeType, heatLevel]);

  const handleDone = () => {
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#ff00ff', '#00ffff'] });
    setTimeout(() => setGameState("lobby"), 3000);
  };

  const handleSkip = () => {
    setGameState("penalty");
    playShotSound();
  };

  return (
    <main className="min-h-screen bg-black text-white font-sans overflow-hidden relative selection:bg-pink-500">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-black to-black z-0 pointer-events-none" />
      <div className={`absolute inset-0 transition-opacity duration-1000 z-0 opacity-30 ${heatLevel > 7 ? 'bg-red-900/20' : 'bg-transparent'}`} />

      {/* --- Auth Status & Connection Status (Top Left) --- */}
      <div className="absolute top-4 left-4 z-50 flex flex-col gap-2 items-start">
        {authUser ? (
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/20">
                <div className="flex flex-col text-xs">
                    <span className="text-gray-400">מחובר כ:</span>
                    <span className="font-bold text-white">{authUser.email?.split('@')[0]}</span>
                </div>
                <button onClick={handleLogout} className="p-2 hover:bg-red-500/20 rounded-full transition-colors text-red-400" title="התנתק">
                    <LogOut size={16} />
                </button>
                {/* כפתור רענון ידני */}
                <button onClick={handleManualRefresh} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-400" title="רענן רשימה">
                    <RefreshCw size={16} />
                </button>
            </div>
        ) : (
            <Link href="/login" className="flex items-center gap-2 bg-pink-600 hover:bg-pink-500 px-4 py-2 rounded-full font-bold text-sm transition-colors shadow-lg">
                <UserIcon size={16} />
                התחברות למארח
            </Link>
        )}

        {/* Connection Indicator */}
        {!isConnected && (
             <div className="flex items-center gap-2 bg-red-900/80 backdrop-blur-md px-4 py-1 rounded-full border border-red-500/50 text-red-200 text-xs font-bold animate-pulse">
                <WifiOff size={14} />
                מנותק מ-Supabase (בדוק הגדרות Vercel)
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
          <h1 className="text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 drop-shadow-[0_0_15px_rgba(236,72,153,0.5)] text-center">
            TRUTH OR DARE <br/> <span className="text-4xl text-white font-light tracking-widest">AI EDITION</span>
          </h1>

          {/* Player Circle Display - REALTIME */}
          <div className="flex flex-wrap gap-4 justify-center items-center min-h-[100px] px-10">
            {players.length === 0 ? (
              <div className="text-gray-500 text-xl animate-pulse">
                {authUser ? "ממתין לשחקנים... סרקו את הקוד" : "נא להתחבר כדי להתחיל משחק"}
              </div>
            ) : (
              players.map((p) => (
                <motion.div 
                  key={p.id}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex flex-col items-center gap-2"
                >
                    <div className={`w-20 h-20 rounded-full border-2 border-white/50 overflow-hidden shadow-[0_0_15px_rgba(255,255,255,0.3)]`}>
                       {p.avatar.startsWith('bg-') ? (
                          <div className={`w-full h-full ${p.avatar}`} />
                       ) : (
                          <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                       )}
                    </div>
                    <span className="font-bold text-sm">{p.name}</span>
                </motion.div>
              ))
            )}
          </div>

          {/* Controls */}
          <div className="bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/10 w-full max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-cyan-400 font-bold flex items-center gap-2"><Flame /> רמת חום: {heatLevel}</span>
              <span className="text-xs text-gray-400 uppercase tracking-widest">
                {heatLevel < 4 ? "משעשע וקליל" : heatLevel < 8 ? "לוהט ונועז" : "למבוגרים בלבד 🔞"}
              </span>
            </div>
            <input 
              type="range" 
              min="1" 
              max="10" 
              value={heatLevel} 
              onChange={handleHeatChange}
              className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-pink-500 hover:accent-pink-400 transition-all"
            />
            
            <div className="mt-8 flex justify-center gap-4">
              <button 
                onClick={resetGame}
                disabled={!authUser}
                className="px-4 py-3 bg-red-900/50 hover:bg-red-800 rounded-xl flex items-center gap-2 transition text-xs disabled:opacity-30"
                title="איפוס משחק"
              >
                <Trash2 size={16} />
              </button>
              
              <button 
                onClick={spinTheWheel}
                disabled={players.length < 2 || !authUser}
                className="flex-1 px-12 py-4 bg-gradient-to-r from-pink-600 to-purple-600 rounded-xl font-bold text-2xl hover:scale-105 transition-transform shadow-[0_0_30px_rgba(236,72,153,0.6)] disabled:opacity-50 disabled:hover:scale-100 text-white"
              >
                SPIN IT!
              </button>
            </div>
          </div>

          <div className="absolute bottom-10 right-10 bg-white p-3 rounded-xl opacity-90 shadow-[0_0_20px_rgba(255,255,255,0.3)] flex flex-col items-center gap-2 transform rotate-3 hover:rotate-0 transition-transform">
             {authUser && joinUrl ? (
                <div style={{ height: "auto", maxWidth: "120px", width: "100%" }}>
                  <QRCode
                    size={256}
                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                    value={joinUrl}
                    viewBox={`0 0 256 256`}
                  />
                </div>
             ) : (
               <div className="w-[120px] h-[120px] bg-gray-300 flex items-center justify-center text-black text-xs text-center p-2 font-bold">
                 התחבר כדי להציג קוד
               </div>
             )}
            <p className="text-black text-[10px] uppercase font-black tracking-widest">Scan to Join</p>
          </div>
        </motion.div>
      )}

      {/* --- SPINNING / REVEALING VIEW --- */}
      {(gameState === "spinning" || gameState === "revealing") && (
        <div className="flex flex-col items-center justify-center h-screen z-10 relative">
          <motion.div
            animate={{ rotate: 360 * 5 }}
            transition={{ duration: 3, ease: "circOut" }}
            className="w-64 h-64 rounded-full border-4 border-dashed border-cyan-500 flex items-center justify-center relative shadow-[0_0_50px_rgba(6,182,212,0.5)]"
          >
            <div className="absolute inset-0 bg-cyan-500/20 rounded-full blur-xl" />
            <span className="text-4xl font-black italic">?</span>
          </motion.div>
          
          <h2 className="mt-8 text-3xl font-bold animate-bounce text-cyan-400">
            {gameState === "spinning" ? "מי הבא בתור..." : "מכין את האתגר..."}
          </h2>

          {loadingAI && (
             <div className="mt-4 text-pink-500 font-mono text-xl animate-pulse">
             Gemini AI מבשל משהו חריף...
           </div>
          )}
        </div>
      )}

      {/* --- CHALLENGE VIEW --- */}
      {gameState === "challenge" && currentChallenge && selectedPlayer && (
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center justify-center h-screen z-20 relative px-4"
        >
          <div className="absolute top-10 right-10 flex flex-col gap-1 items-center">
            <span className="text-xs font-bold uppercase tracking-widest mb-2 text-gray-400">Spiciness</span>
            <div className="flex gap-1">
                {Array.from({ length: 10 }).map((_, i) => (
                <div 
                    key={i} 
                    className={`w-3 h-10 rounded-sm transition-all duration-500 ${i < currentChallenge.spiciness ? 'bg-gradient-to-t from-red-600 to-orange-400 shadow-[0_0_10px_red]' : 'bg-gray-800'}`} 
                />
                ))}
            </div>
          </div>

          <div className="text-center mb-6">
            <div className={`inline-block w-32 h-32 rounded-full border-4 border-white mb-4 shadow-xl overflow-hidden`}>
               {selectedPlayer.avatar.startsWith('bg-') ? (
                   <div className={`w-full h-full ${selectedPlayer.avatar}`} />
               ) : (
                   <img src={selectedPlayer.avatar} alt={selectedPlayer.name} className="w-full h-full object-cover" />
               )}
            </div>
            <h2 className="text-5xl font-bold text-white mb-2">{selectedPlayer.name}</h2>
            <h3 className={`text-4xl font-black uppercase tracking-widest ${challengeType === 'Truth' ? 'text-blue-400 drop-shadow-[0_0_10px_rgba(59,130,246,0.8)]' : 'text-pink-500 drop-shadow-[0_0_10px_rgba(236,72,153,0.8)]'}`}>
              {challengeType}
            </h3>
          </div>

          <motion.div 
            className="bg-black/60 backdrop-blur-xl border-2 p-12 rounded-[3rem] max-w-4xl w-full text-center relative overflow-hidden shadow-2xl min-h-[300px] flex items-center justify-center"
            style={{ borderColor: currentChallenge.themeColor }}
          >
             <div className="absolute inset-0 opacity-20 bg-gradient-to-br from-transparent to-current" style={{ color: currentChallenge.themeColor }} />
             
             <p className="text-4xl md:text-5xl font-bold leading-tight drop-shadow-lg" style={{ color: currentChallenge.themeColor || '#fff', direction: "rtl" }}>
               {currentChallenge.content}
             </p>
          </motion.div>

          <div className="flex gap-8 mt-12">
            <button onClick={handleSkip} className="group flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center group-hover:bg-red-600 transition-colors border-2 border-transparent group-hover:border-red-400">
                <XCircle size={40} />
              </div>
              <span className="font-bold text-gray-400 group-hover:text-white">דלג (שוט)</span>
            </button>

            <button onClick={handleDone} className="group flex flex-col items-center gap-2">
              <div className="w-24 h-24 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.5)] group-hover:scale-110 transition-transform border-4 border-white/20">
                <CheckCircle size={48} />
              </div>
              <span className="font-bold text-green-400 group-hover:text-green-300">בוצע!</span>
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
             SHOT TIME!
           </h1>
           <p className="text-4xl text-white mt-12 font-bold animate-pulse">
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