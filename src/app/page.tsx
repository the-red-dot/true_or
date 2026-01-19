// src/app/page.tsx
"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Flame, Trash2, LogOut, User as UserIcon, WifiOff, RefreshCw,
  Cpu, Beer, ThumbsUp, ThumbsDown, LogIn, Play, MessageCircleQuestion, Zap,
  Gavel 
} from "lucide-react";
import QRCode from "react-qr-code";
import Link from "next/link";

import { useHostGameLogic } from "@/app/hooks/useHostGameLogic";
import { useGameSounds } from "@/app/hooks/useGameSounds";

export default function TruthOrDareGame() {
  const { playSpin, playShot, playWin } = useGameSounds();

  const {
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
    endGame
  } = useHostGameLogic(playSpin, playShot, playWin);

  // --- Helper Functions for Penalty UI ---
  const renderPenaltyIcon = (type: string | undefined) => {
      switch (type) {
          case 'lemon': 
            return <div className="text-[150px]">🍋</div>;
          case 'vinegar': 
            return <div className="text-[150px]">🫗</div>; 
          case 'onion': 
            return <div className="text-[150px]">🧅</div>; 
          case 'garlic': 
            return <div className="text-[150px]">🧄</div>;
          case 'water':
            return <div className="text-[150px]">💦</div>;
          case 'ice':
            return <div className="text-[150px]">🧊</div>;
          case 'shot': 
            return <Beer size={180} className="text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.8)]" />;
          case 'kiss_wall':
            return <div className="text-[150px]">💋</div>;
          case 'squats':
            return <div className="text-[150px]">🏋️</div>;
          case 'tea_bag':
            return <div className="text-[150px]">🍵</div>;
          case 'pasta':
            return <div className="text-[150px]">🍝</div>;
          case 'lipstick':
            return <div className="text-[150px]">💄</div>;
          case 'oil':
            return <div className="text-[150px]">🥄</div>;
          case 'chili':
            return <div className="text-[150px]">🌶️</div>;
          default: 
            return <div className="text-[150px]">😈</div>;
      }
  };

  const getPenaltyColor = (type: string | undefined) => {
      switch(type) {
          case 'lemon': return 'bg-yellow-900/95';
          case 'vinegar': return 'bg-amber-900/95';
          case 'onion': return 'bg-purple-900/95';
          case 'garlic': return 'bg-gray-800/95';
          case 'water': return 'bg-blue-900/95';
          case 'ice': return 'bg-cyan-900/95';
          case 'chili': return 'bg-red-950/95';
          case 'tea_bag': return 'bg-emerald-900/95';
          default: return 'bg-red-900/90'; 
      }
  };

  return (
    <main
      className="h-screen w-full bg-black text-white font-sans overflow-hidden relative selection:bg-pink-500 flex flex-col"
      dir="rtl"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-black to-black z-0 pointer-events-none" />

      {/* Top Bar */}
      {authUser && (
        <div className="absolute top-6 left-6 z-40 flex items-center gap-4 bg-black/40 backdrop-blur px-4 py-2 rounded-full border border-white/10">
          <div className="flex flex-col text-left">
            <span className="text-xs text-gray-400 font-bold uppercase">קוד חדר</span>
            <span className="text-xl font-mono text-pink-500 tracking-widest">
              {authUser.email?.split("@")[0] || "..."}
            </span>
          </div>
          <div className="h-8 w-px bg-white/20"></div>
          <div className="flex items-center gap-2">
            <UserIcon size={16} /> {players.length}
          </div>
          <button onClick={handleManualRefresh} className="p-2 hover:bg-white/20 rounded-full transition-colors text-blue-400" title="רענון">
            <RefreshCw size={16} />
          </button>
          <button onClick={() => endGame(true)} className="p-2 hover:bg-red-500/20 rounded-full transition-colors text-red-400" title="איפוס משחק">
            <Trash2 size={20} />
          </button>
          <button onClick={handleLogout} className="p-2 hover:bg-red-500/20 rounded-full transition-colors text-red-400" title="התנתק">
            <LogOut size={16} />
          </button>
          {!isConnected && <WifiOff className="text-red-500 animate-pulse" />}
        </div>
      )}

      {/* Global Emojis Overlay (LTR for proper X positioning) */}
      <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden" dir="ltr">
        <AnimatePresence>
          {reactions.map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, scale: 0.5, y: "100vh", x: "-50%" }}
              animate={{ opacity: 1, scale: [1, 1.5, 1], y: "-20vh" }}
              exit={{ opacity: 0 }}
              style={{ left: `${r.x}%` }}
              transition={{ duration: 4, ease: "easeOut" }}
              className="absolute text-7xl md:text-8xl drop-shadow-[0_0_15px_rgba(0,0,0,0.8)]"
            >
              {r.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 p-10 h-full">
        {!authUser && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center text-center space-y-8 p-10 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-xl"
          >
            <div className="bg-pink-600/20 p-6 rounded-full">
              <Trash2 className="w-20 h-20 text-pink-500 opacity-50" />
            </div>
            <h1 className="text-5xl font-black">המשחק נותק</h1>
            <p className="text-xl text-gray-400 max-w-md">
              כדי לייצר קוד QR ולהתחיל משחק חדש, עליך להתחבר כמארח.
            </p>
            <Link
              href="/login"
              className="px-10 py-5 bg-gradient-to-r from-pink-600 to-purple-600 rounded-2xl font-bold text-2xl shadow-xl hover:scale-105 transition-transform flex items-center gap-4"
            >
              <LogIn size={32} /> התחבר מחדש
            </Link>
          </motion.div>
        )}

        {authUser && (gameState === "lobby" || gameState === "waiting_for_spin") && (
          <div className="flex flex-col items-center w-full max-w-6xl h-full justify-center">
            <h1 className="text-8xl md:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 drop-shadow-[0_0_30px_rgba(236,72,153,0.5)] mb-12 tracking-tighter">
              {gameState === "lobby" ? "אמת או חובה" : "הבא בתור..."}
            </h1>

            <div className="flex flex-wrap justify-center gap-8 px-4">
              {players.length === 0 && (
                <div className="text-2xl text-gray-500 animate-pulse">
                  ממתין לשחקנים... סרקו את הקוד
                </div>
              )}

              {players.map((p) => {
                const isController = lastActivePlayer?.id === p.id;
                return (
                  <div key={p.id} className="relative group">
                    <div
                      className={`w-28 h-28 rounded-full border-4 overflow-hidden transition-all duration-300 relative ${
                        isController
                          ? "border-yellow-400 shadow-[0_0_40px_rgba(250,204,21,0.6)] scale-110"
                          : "border-white/20"
                      }`}
                    >
                      {p.avatar.startsWith("bg-") ? (
                        <div className={`w-full h-full ${p.avatar}`} />
                      ) : (
                        <img src={p.avatar} className="w-full h-full object-cover" />
                      )}
                      {isController && (
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <RefreshCw className="text-white w-10 h-10 animate-spin-slow" />
                        </div>
                      )}
                    </div>
                    <div className="text-center mt-2 font-bold text-lg drop-shadow-md">
                      {p.name}
                    </div>
                    {isController && (
                      <div className="text-center text-yellow-400 text-xs font-bold animate-pulse">
                        מחזיק בשרביט
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-12 bg-white/5 backdrop-blur-xl p-4 rounded-2xl border border-white/10 flex items-center gap-6">
              {players.length >= 2 && (
                <button
                  onClick={spinTheWheel}
                  className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-500 rounded-xl font-bold flex items-center gap-2 hover:scale-105 transition-transform shadow-lg"
                >
                  <Play className="fill-white" /> התחל משחק
                </button>
              )}
              
              <div className="flex gap-2 border-r border-white/20 pr-6 mr-2 items-center">
                  {[1, 2, 3].map((level) => (
                      <button
                        key={level}
                        onClick={() => setHeatLevel(level)}
                        className={`
                            relative group overflow-hidden px-4 py-2 rounded-xl transition-all duration-300
                            ${heatLevel === level 
                                ? 'bg-gradient-to-t from-orange-600 to-yellow-500 shadow-[0_0_20px_rgba(251,191,36,0.6)] scale-110' 
                                : 'bg-gray-800/50 hover:bg-gray-700/50 text-gray-400'}
                        `}
                      >
                          <div className="flex flex-col items-center relative z-10">
                              <span className={`text-2xl ${heatLevel === level ? 'animate-pulse' : 'grayscale opacity-50'}`}>
                                  {level === 1 ? '🔥' : level === 2 ? '🔥🔥' : '🔥🔥🔥'}
                              </span>
                              <span className="text-[10px] font-bold mt-1 uppercase tracking-wide">
                                  {level === 1 ? 'קליל' : level === 2 ? 'נועז' : 'לוהט'}
                              </span>
                          </div>
                      </button>
                  ))}
              </div>

              <button
                onClick={() => endGame(true)}
                className="p-2 hover:bg-red-900/50 rounded-lg text-red-300 ml-4 flex items-center gap-2"
                title="סיום משחק"
              >
                <Trash2 size={20} />
                <span className="hidden md:inline font-bold">סיום משחק</span>
              </button>
            </div>
          </div>
        )}

        {authUser && gameState === "spinning" && (
          <div className="relative">
            <motion.div
              animate={{ rotate: 360 * 5 }}
              transition={{ duration: 3, ease: "circOut" }}
              className="w-96 h-96 rounded-full border-[12px] border-dashed border-cyan-500/30 flex items-center justify-center"
            >
              <span className="text-9xl">🎡</span>
            </motion.div>
          </div>
        )}

        {authUser && gameState === "spotlight" && selectedPlayer && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="text-center flex flex-col items-center"
          >
            <div className="w-72 h-72 rounded-full border-8 border-white shadow-[0_0_100px_white] overflow-hidden mb-8 relative">
              <img src={selectedPlayer.avatar} className="w-full h-full object-cover" />
            </div>
            <h2 className="text-8xl font-black text-white mb-4 drop-shadow-lg">
              {selectedPlayer.name}
            </h2>
            <h3 className="text-4xl font-bold text-pink-400 tracking-widest uppercase animate-pulse">
              {selectedPlayer.gender === "female" ? "תתכונני!" : "תתכונן!"}
            </h3>
          </motion.div>
        )}

        {/* Waiting for choice UI */}
        {authUser && gameState === "waiting_for_choice" && selectedPlayer && (
            <div className="flex flex-col items-center justify-center space-y-12">
                <div className="flex gap-12 items-center">
                    <div className="flex flex-col items-center gap-4 opacity-50">
                        <MessageCircleQuestion size={80} className="text-blue-500" />
                        <span className="text-2xl font-bold">אמת?</span>
                    </div>
                    
                    <motion.div 
                        animate={{ scale: [1, 1.2, 1] }} 
                        transition={{ repeat: Infinity, duration: 1 }}
                        className="w-48 h-48 rounded-full border-4 border-white overflow-hidden shadow-[0_0_50px_rgba(255,255,255,0.5)] z-10"
                    >
                        <img src={selectedPlayer.avatar} className="w-full h-full object-cover" />
                    </motion.div>

                    <div className="flex flex-col items-center gap-4 opacity-50">
                        <Zap size={80} className="text-red-500" />
                        <span className="text-2xl font-bold">חובה?</span>
                    </div>
                </div>
                <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-red-400 animate-pulse">
                    ממתין לבחירה...
                </h2>
            </div>
        )}

        {/* Challenge / Revealing UI */}
        {authUser &&
          (gameState === "challenge" || gameState === "revealing") &&
          currentChallenge &&
          selectedPlayer && (
            <div className="flex flex-col items-center justify-between h-full w-full py-10">
              <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-full max-w-5xl px-4 relative z-20"
              >
                {/* --- Active Player Avatar Header --- */}
                <div className="absolute -top-16 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center">
                   <div className="w-32 h-32 rounded-full border-4 border-white shadow-lg overflow-hidden bg-black relative z-10">
                      <img src={selectedPlayer.avatar} className="w-full h-full object-cover" alt="Active Player" />
                   </div>
                   <div className="mt-2 bg-black/80 px-4 py-1 rounded-full text-white font-bold text-lg backdrop-blur-sm shadow-md border border-white/10">
                      {selectedPlayer.name}
                   </div>
                </div>

                {/* --- Challenge Card --- */}
                <div className="bg-gray-900/90 backdrop-blur-xl border border-white/20 p-12 rounded-[3rem] text-center shadow-2xl relative overflow-hidden pt-40">
                  <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-pink-500 to-cyan-500" />
                  
                  {/* Heat Meter Visualization (3 Bars) - TV Version */}
                  <div className="flex flex-col items-center gap-3 mb-8">
                     <span className="text-gray-400 text-sm font-bold tracking-widest uppercase">
                        {currentChallenge.spiciness === 1 ? 'קליל' : currentChallenge.spiciness === 2 ? 'נועז' : 'לוהט 18+'}
                     </span>
                     <div className="flex gap-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                           <div
                             key={i}
                             className={`w-12 h-4 rounded-full transition-all duration-300 ${
                               i < currentChallenge.spiciness
                                 ? "bg-gradient-to-r from-orange-600 to-yellow-400 shadow-[0_0_15px_rgba(251,191,36,0.6)]"
                                 : "bg-gray-700/50"
                             }`}
                           />
                        ))}
                     </div>
                  </div>

                  <div className="flex justify-center mb-8">
                    <span
                      className={`text-5xl font-black px-8 py-3 rounded-full shadow-lg ${
                        challengeType === "אמת"
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                          : "bg-pink-500/20 text-pink-400 border border-pink-500/30"
                      }`}
                    >
                      {challengeType}
                    </span>
                  </div>
                  
                  <h3
                    className="text-5xl md:text-7xl font-black leading-tight mb-12 drop-shadow-lg"
                    style={{ direction: "rtl" }}
                  >
                    {currentChallenge.content}
                  </h3>

                  <div className="flex items-center gap-4 max-w-lg mx-auto bg-black/50 p-2 rounded-full">
                    <ThumbsUp className="text-green-500" />
                    <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="bg-green-500 h-full transition-all duration-300"
                        style={{
                          width: `${(votes.likes / Math.max(1, players.length - 1)) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden flex justify-end">
                      <div
                        className="bg-red-500 h-full transition-all duration-300"
                        style={{
                          width: `${(votes.dislikes / Math.max(1, players.length - 1)) * 100}%`,
                        }}
                      />
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
            </div>
          )}

        {/* Live Penalty Selection Preview */}
        <AnimatePresence>
            {gameState === "choosing_penalty" && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md"
                >
                    <div className="text-center">
                        <Gavel size={80} className="mx-auto text-purple-500 mb-6 animate-bounce" />
                        <h2 className="text-6xl font-black text-white mb-4">בוחרים עונש...</h2>
                        
                        {lastActivePlayer && (
                            <div className="flex items-center justify-center gap-3 mb-8">
                                <img src={lastActivePlayer.avatar} className="w-12 h-12 rounded-full border-2 border-purple-500" />
                                <span className="text-2xl text-purple-300 font-bold">{lastActivePlayer.name} מחליט/ה</span>
                            </div>
                        )}

                        <div className="h-96 flex items-center justify-center">
                            {previewPenalty ? (
                                <motion.div 
                                    key={previewPenalty.text}
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="bg-gray-800 border border-gray-600 p-8 rounded-3xl max-w-xl text-center"
                                >
                                    <div className="mb-4 flex justify-center">{renderPenaltyIcon(previewPenalty.type)}</div>
                                    <h3 className="text-4xl font-bold mb-2">{previewPenalty.text}</h3>
                                    {previewPenalty.description && <p className="text-xl text-gray-400 italic">"{previewPenalty.description}"</p>}
                                </motion.div>
                            ) : (
                                <p className="text-xl text-gray-500 animate-pulse">מתלבט/ת...</p>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>

        {/* Final Penalty Result */}
        <AnimatePresence>
          {gameState === "penalty" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2 }}
              className={`absolute inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-md overflow-hidden ${getPenaltyColor(currentPenalty?.type)}`}
            >
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] opacity-20" />
              
              <motion.div
                animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
                className="mb-8"
              >
                {renderPenaltyIcon(currentPenalty?.type)}
              </motion.div>

              <h1 className="text-9xl font-black uppercase mb-4 text-white drop-shadow-[0_5px_5px_rgba(0,0,0,1)] border-4 border-white p-4">
                העונש נבחר!
              </h1>
              
              <h2 className="text-6xl font-bold text-white/90 mt-4 text-center px-4 leading-tight drop-shadow-md">
                {currentPenalty?.text || `${selectedPlayer?.name} מוותר/ת!`}
              </h2>
              {currentPenalty?.description && (
                  <p className="text-3xl text-white/80 mt-4 italic font-medium">
                      "{currentPenalty.description}"
                  </p>
              )}

              <div className="absolute bottom-20 w-full text-center">
                <p className="text-2xl animate-pulse text-white/70">המשחק ממשיך מיד...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Group Shot Voting Result */}
        <AnimatePresence>
          {shotVoteMode && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[100] bg-orange-600 flex flex-col items-center justify-center"
            >
              <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 0.5 }}>
                <Beer size={200} className="mb-8 text-yellow-300" />
              </motion.div>
              <h1 className="text-8xl font-black text-white border-y-8 border-white py-4">כולם שותים!</h1>
              <p className="text-3xl mt-4 font-bold text-orange-200">הקהל אמר את דברו</p>
            </motion.div>
          )}
        </AnimatePresence>

        {authUser && joinUrl && (
          <div
            className={`absolute z-30 transition-all duration-500 bg-white p-2 rounded-xl shadow-2xl ${
              gameState === "lobby" || gameState === "waiting_for_spin"
                ? "bottom-20 right-10 scale-125 rotate-3 hover:rotate-0"
                : "bottom-6 right-6 scale-75 opacity-70 hover:opacity-100"
            }`}
          >
            <QRCode value={joinUrl} size={gameState === "lobby" ? 120 : 100} />
            {(gameState === "lobby" || gameState === "waiting_for_spin") && (
              <p className="text-black text-[10px] font-black text-center mt-1 uppercase tracking-widest">
                סרוק להצטרפות
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}