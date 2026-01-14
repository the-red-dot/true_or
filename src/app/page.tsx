"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Flame, 
  UserPlus, 
  CheckCircle, 
  XCircle 
} from "lucide-react";
import confetti from "canvas-confetti";
import QRCode from "react-qr-code";

// --- Types ---
type Player = {
  id: string;
  name: string;
  gender: "male" | "female" | "other";
  avatar: string; // Tailwind class or URL
};

type Challenge = {
  content: string;
  spiciness: number;
  themeColor: string;
};

// --- Mock Data for Demo (In real app, this comes from database) ---
const MOCK_PLAYERS: Player[] = [
  { id: "1", name: "דניאל", gender: "male", avatar: "bg-blue-500" },
  { id: "2", name: "נועה", gender: "female", avatar: "bg-pink-500" },
  { id: "3", name: "עומר", gender: "male", avatar: "bg-purple-500" },
  { id: "4", name: "מאיה", gender: "female", avatar: "bg-red-500" },
];

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

  // --- Init ---
  useEffect(() => {
    // Set the join URL for the QR code
    if (typeof window !== "undefined") {
      setJoinUrl(`${window.location.origin}/join`);
    }
  }, []);

  // --- Audio placeholders (Logic only) ---
  const playSpinSound = () => { /* Play spin.mp3 */ };
  const playWinSound = () => { /* Play win.mp3 */ };
  const playShotSound = () => { /* Play shot.mp3 */ };

  // --- Helpers ---
  const addMockPlayers = () => {
    setPlayers(MOCK_PLAYERS);
  };

  const handleHeatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHeatLevel(parseInt(e.target.value));
  };

  const spinTheWheel = () => {
    if (players.length < 2) return alert("צריך לפחות 2 שחקנים!");
    
    setGameState("spinning");
    playSpinSound();
    
    // Fake spin duration
    setTimeout(() => {
      const randomPlayer = players[Math.floor(Math.random() * players.length)];
      setSelectedPlayer(randomPlayer);
      
      // Randomly decide Truth or Dare for flow
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
          // Fallback in case of error
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
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#ff00ff', '#00ffff']
    });
    setTimeout(() => setGameState("lobby"), 3000);
  };

  const handleSkip = () => {
    setGameState("penalty");
    playShotSound();
  };

  // --- Components ---

  return (
    <main className="min-h-screen bg-black text-white font-sans overflow-hidden relative selection:bg-pink-500">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-black to-black z-0 pointer-events-none" />
      <div className={`absolute inset-0 transition-opacity duration-1000 z-0 opacity-30 ${heatLevel > 7 ? 'bg-red-900/20' : 'bg-transparent'}`} />

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

          {/* Player Circle Display */}
          <div className="flex flex-wrap gap-4 justify-center items-center min-h-[100px]">
            {players.length === 0 ? (
              <div className="text-gray-500 text-xl animate-pulse">ממתין לשחקנים... סרקו את הקוד</div>
            ) : (
              players.map((p) => (
                <motion.div 
                  key={p.id}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className={`w-16 h-16 rounded-full ${p.avatar} border-2 border-white/50 flex items-center justify-center shadow-[0_0_15px_currentColor] text-xl font-bold`}
                >
                  {p.name[0]}
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
              {players.length === 0 && (
                <button onClick={addMockPlayers} className="px-6 py-3 bg-gray-800 rounded-xl hover:bg-gray-700 flex items-center gap-2 transition">
                  <UserPlus size={20} /> (הוסף דמו)
                </button>
              )}
              <button 
                onClick={spinTheWheel}
                disabled={players.length < 2}
                className="px-12 py-4 bg-gradient-to-r from-pink-600 to-purple-600 rounded-xl font-bold text-2xl hover:scale-105 transition-transform shadow-[0_0_30px_rgba(236,72,153,0.6)] disabled:opacity-50 disabled:hover:scale-100 text-white"
              >
                SPIN IT!
              </button>
            </div>
          </div>

          {/* QR Code Section - Dynamic */}
          <div className="absolute bottom-10 right-10 bg-white p-3 rounded-xl opacity-90 shadow-[0_0_20px_rgba(255,255,255,0.3)] flex flex-col items-center gap-2 transform rotate-3 hover:rotate-0 transition-transform">
             {joinUrl && (
                <div style={{ height: "auto", maxWidth: "120px", width: "100%" }}>
                  <QRCode
                    size={256}
                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                    value={joinUrl}
                    viewBox={`0 0 256 256`}
                  />
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
          {/* Spiciness Indicator */}
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
            <div className={`inline-block w-24 h-24 rounded-full ${selectedPlayer.avatar} border-4 border-white mb-4 shadow-xl text-4xl flex items-center justify-center font-bold`}>
              {selectedPlayer.name[0]}
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