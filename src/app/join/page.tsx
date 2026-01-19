// src/app/join/page.tsx
"use client";

import React, { Suspense } from "react";
import { motion } from "framer-motion";
import {
  Camera, Loader2, AlertTriangle, Beer, XCircle, Flame, RefreshCw, LogOut,
  MessageCircleQuestion, Zap, ShieldCheck
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { usePlayerGameLogic } from "@/app/hooks/usePlayerGameLogic";

function GameController() {
  const searchParams = useSearchParams();
  const hostId = searchParams.get("hostId");

  const {
    name, setName,
    gender, setGender,
    imagePreview, handleImageUpload,
    // Safety
    isAdult, setIsAdult,
    personalMaxHeat, setPersonalMaxHeat,
    
    isSubmitted,
    loading,
    authReady,
    authUser,
    gameState,
    localHeat,
    myPlayerId,
    handleJoin,
    handleLeaveGame,
    handleSpin,
    handleHeatChange,
    sendEmoji,
    sendVote,
    sendChoice
  } = usePlayerGameLogic(hostId);

  // --- Render Functions ---

  if (!hostId) {
    return (
      <div className="text-white p-10 text-center flex flex-col items-center justify-center h-screen bg-black" dir="rtl">
        <AlertTriangle size={48} className="text-red-500 mb-4" />
        קוד משחק שגוי
      </div>
    );
  }

  const isAnonymous = (authUser as any)?.is_anonymous === true;

  // --- Active Game View ---
  if (isSubmitted && myPlayerId && gameState) {
    const isMyTurnToPlay = gameState.current_player_id === myPlayerId;
    const isMyTurnToSpin =
      gameState.last_active_player_id === myPlayerId &&
      (gameState.status === "lobby" || gameState.status === "waiting_for_spin");
    
    const isWaitingForChoice = gameState.status === "waiting_for_choice";

    return (
      <div className="fixed inset-0 bg-gray-900 text-white flex flex-col overflow-hidden" dir="rtl">
        {/* Header */}
        <div className="pt-4 px-4 pb-2 bg-gray-800/50 backdrop-blur-md border-b border-gray-700/50 flex justify-between items-center z-10 shrink-0">
          <div className="flex items-center gap-3">
            {imagePreview && <img src={imagePreview} className="w-8 h-8 rounded-full object-cover border border-white" />}
            <span className="font-bold truncate max-w-[140px]">{name}</span>
          </div>
          <div className="flex gap-2 items-center">
            <div className="hidden sm:flex text-[10px] px-2 py-1 bg-green-500/20 text-green-400 rounded-full border border-green-500/30 items-center">
              {isAnonymous ? "מחובר" : "מחובר"}
            </div>
            <button onClick={handleLeaveGame} className="p-1 bg-red-500/20 text-red-400 rounded-lg" title="צא מהמשחק">
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Main Content Area - Scrollable */}
        <div className="flex-1 flex flex-col p-4 w-full max-w-md mx-auto overflow-y-auto">
          
          {/* 1. SPIN CONTROLS */}
          {isMyTurnToSpin && !isWaitingForChoice && (
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col gap-6 justify-center h-full">
              <div className="text-center">
                <h2 className="text-3xl font-black mb-1 text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500">
                  {gameState.status === "lobby" ? "אתה מתחיל!" : "השרביט אצלך!"}
                </h2>
                <p className="text-gray-400 text-sm">בחר רמת חום וסובב</p>
              </div>

              <div className="bg-gray-800/80 p-5 rounded-3xl border border-gray-700 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <span className="flex items-center gap-2 font-bold text-xl text-orange-400">
                    <Flame className="fill-orange-400" /> {localHeat}
                  </span>
                  <span className="text-xs text-gray-400 uppercase tracking-widest">
                    {localHeat < 4 ? "קליל" : localHeat < 8 ? "לוהט" : "אקסטרים"}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10" 
                  step="1"
                  value={localHeat}
                  onChange={(e) => handleHeatChange(parseInt(e.target.value))}
                  className="w-full h-8 bg-gray-700 rounded-full appearance-none cursor-pointer accent-pink-500"
                />
                <div className="text-[10px] text-gray-500 mt-2 text-center">
                    מוגבל למקסימום {personalMaxHeat} לפי הגדרות הבטיחות שלך
                </div>
              </div>

              <button
                onClick={handleSpin}
                className="w-full py-6 bg-gradient-to-r from-pink-600 to-purple-600 rounded-3xl font-black text-3xl shadow-[0_0_30px_rgba(236,72,153,0.4)] active:scale-95 transition-transform flex items-center justify-center gap-3"
              >
                <RefreshCw size={32} className="animate-spin-slow" />{" "}
                {gameState.status === "lobby" ? "התחל משחק" : "סובב!"}
              </button>
            </motion.div>
          )}

          {/* 2. CHOICE CONTROLS (Truth / Dare Buttons) */}
          {isWaitingForChoice && isMyTurnToPlay && (
             <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col gap-4 justify-center h-full">
               <div className="text-center mb-6">
                 <h2 className="text-4xl font-black text-white">תורך לבחור!</h2>
                 <p className="text-gray-400">מה זה יהיה הפעם?</p>
               </div>
               
               <button 
                 onClick={() => sendChoice("אמת")}
                 className="w-full py-8 bg-blue-600 rounded-3xl flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all border-b-8 border-blue-800"
               >
                 <MessageCircleQuestion size={48} className="mb-2 text-blue-200" />
                 <span className="text-3xl font-black text-white">אמת</span>
               </button>

               <button 
                 onClick={() => sendChoice("חובה")}
                 className="w-full py-8 bg-red-600 rounded-3xl flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all border-b-8 border-red-800"
               >
                 <Zap size={48} className="mb-2 text-yellow-300" />
                 <span className="text-3xl font-black text-white">חובה</span>
               </button>
             </motion.div>
          )}

          {/* 3. ACTIVE CHALLENGE VIEW & STATUS */}
          {!isMyTurnToSpin && !isWaitingForChoice && (
            <div className="w-full flex flex-col justify-center gap-4 h-full">
              
              {/* Show Challenge Card to Active Player */}
              {isMyTurnToPlay && gameState.status === "challenge" && (
                <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full flex flex-col gap-4 h-full justify-center">
                  
                  {/* The Challenge Card */}
                  <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-3xl border border-white/20 shadow-2xl relative overflow-hidden flex flex-col gap-4">
                    <div className={`absolute top-0 left-0 w-full h-2 ${gameState.challenge_type === 'אמת' ? 'bg-blue-500' : 'bg-pink-500'}`} />
                    
                    <div className="flex justify-between items-start">
                        <span className={`text-lg font-black px-4 py-1 rounded-full border ${gameState.challenge_type === 'אמת' ? 'bg-blue-500/20 text-blue-300 border-blue-500/50' : 'bg-pink-500/20 text-pink-300 border-pink-500/50'}`}>
                            {gameState.challenge_type}
                        </span>
                        
                        {/* Heat Level Indicator */}
                        <div className="flex items-center gap-1 bg-black/40 px-3 py-1 rounded-xl border border-white/10">
                            <Flame size={16} className={`${(gameState.heat_level || 0) > 6 ? 'text-red-500' : (gameState.heat_level || 0) > 3 ? 'text-yellow-400' : 'text-green-400'} fill-current`} /> 
                            <span className="font-bold text-white">{gameState.heat_level}</span>
                        </div>
                    </div>

                    <div className="py-4">
                        <h3 className="text-2xl md:text-3xl font-black text-white leading-tight text-center" dir="rtl">
                            {gameState.challenge_text}
                        </h3>
                    </div>
                  </div>

                  {/* Give Up Button */}
                  <div className="mt-4">
                      <button
                        onClick={() => sendVote("action_skip")}
                        className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 text-red-200 border-2 border-red-500/50 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 active:scale-95 transition-all"
                      >
                        <XCircle size={24} /> אני מוותר (עונש!)
                      </button>
                      <p className="text-center text-[10px] text-gray-500 mt-2">לחיצה תעביר את התור לשחקן הבא</p>
                  </div>
                </motion.div>
              )}

              {/* Status Texts for Spectators / Waiting */}
              {(!isMyTurnToPlay || gameState.status !== "challenge") && (
                <div className="text-center text-gray-400 animate-pulse flex flex-col items-center justify-center h-full">
                  {gameState.status === "spinning" && <div className="text-6xl animate-spin mb-4">🎲</div>}
                  {gameState.status === "waiting_for_choice" && (
                     <div className="flex flex-col items-center">
                         <div className="text-6xl mb-4 animate-bounce">🤔</div>
                         <p className="text-2xl font-bold text-white mb-2">ממתינים לבחירה...</p>
                         {!isMyTurnToPlay && <p className="text-sm">השחקן חושב כרגע</p>}
                     </div>
                  )}
                  {gameState.status === "revealing" && <div className="text-4xl animate-pulse">🤖</div>}
                  
                  <p className="text-xl font-bold mt-4">
                    {gameState.status === "lobby" ? "ממתינים למארח..." :
                     gameState.status === "waiting_for_spin" ? "ממתינים לסיבוב..." :
                     gameState.status === "spinning" ? "מגריל..." :
                     gameState.status === "penalty" ? "עונש!" : 
                     gameState.status === "revealing" ? "מייצר משימה..." :
                     gameState.status === "waiting_for_choice" ? "" : "המשחק רץ בטלוויזיה..."}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Emoji Bar - Fixed at bottom */}
        <div className="w-full pt-3 pb-6 bg-gray-900 border-t border-gray-800 z-10 shrink-0">
          <p className="text-center text-[10px] text-gray-500 mb-2 font-bold uppercase tracking-widest">תגובה מהירה</p>
          <div className="flex justify-between gap-2 overflow-x-auto pb-2 scrollbar-hide px-2">
            {[{ icon: "😂" }, { icon: "😱" }, { icon: "😍" }, { icon: "🤢" }, { icon: "😈" }, { icon: "🫣" }, { icon: "🔥" }].map(
              (item, idx) => (
                <button
                  key={idx}
                  onClick={() => sendEmoji(item.icon)}
                  className="bg-gray-800 p-3 rounded-2xl text-2xl active:scale-75 transition-transform shadow-md border border-gray-700 flex-shrink-0 hover:bg-gray-700"
                >
                  {item.icon}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Registration View ---
  return (
    <div className="min-h-[100dvh] bg-black text-white p-6 flex flex-col items-center justify-center text-center" dir="rtl">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <div className="text-[10px] px-2 py-1 bg-white/5 text-gray-300 rounded-full border border-white/10">
            {authReady ? (isAnonymous ? "סטטוס: מחובר כאנונימי" : "סטטוס: מחובר") : "מאתחל התחברות..."}
          </div>
        </div>

        <div className="relative mx-auto w-32 h-32">
          <label className="cursor-pointer block w-full h-full rounded-full border-4 border-dashed border-gray-700 hover:border-pink-500 overflow-hidden transition-colors">
            {imagePreview ? <img src={imagePreview} className="w-full h-full object-cover" /> : <Camera className="w-full h-full p-8 text-gray-600" />}
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>
        </div>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="השם שלך"
          className="w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-center text-xl focus:border-pink-500 outline-none"
        />

        <div className="flex gap-2 justify-center w-full">
          {[{ id: "male", l: "גבר" }, { id: "female", l: "אישה" }, { id: "other", l: "אחר" }].map((o) => (
            <button
              key={o.id}
              onClick={() => setGender(o.id as any)}
              className={`flex-1 py-3 rounded-lg border ${gender === o.id ? "bg-pink-600 border-pink-500" : "border-gray-800 bg-gray-900"}`}
            >
              {o.l}
            </button>
          ))}
        </div>

        {/* Safety Settings Card */}
        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 w-full text-right">
            <div className="flex items-center gap-2 mb-4 text-gray-300 border-b border-gray-700 pb-2">
                <ShieldCheck size={18} className="text-green-400" />
                <span className="font-bold text-sm">הגדרות בטיחות</span>
            </div>

            <div className="flex items-center justify-between mb-4">
                <label className="text-sm">אני מעל גיל 18</label>
                <input 
                    type="checkbox" 
                    checked={isAdult} 
                    onChange={(e) => setIsAdult(e.target.checked)}
                    className="w-5 h-5 accent-pink-500"
                />
            </div>

            <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>חום מקסימלי עבורי: {personalMaxHeat}</span>
                    <span>{personalMaxHeat <= 4 ? "בטוח" : "נועז"}</span>
                </div>
                <input 
                    type="range" 
                    min="1" 
                    max={isAdult ? "10" : "4"} 
                    value={personalMaxHeat}
                    onChange={(e) => setPersonalMaxHeat(parseInt(e.target.value))}
                    className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${isAdult ? 'accent-pink-500 bg-gray-700' : 'accent-green-500 bg-green-900/30'}`}
                />
                <p className="text-[10px] text-gray-500 mt-1 leading-tight">
                    {isAdult 
                     ? "כמשתמש בוגר, באפשרותך לבחור כל רמת קושי." 
                     : "משתמשים מתחת לגיל 18 מוגבלים לרמה 4 ומטה."}
                     {" "}לעולם לא תקבל משימה מעל הרמה הזו.
                </p>
            </div>
        </div>

        <button
          onClick={handleJoin}
          disabled={loading}
          className="w-full bg-pink-600 py-4 rounded-xl font-black text-xl shadow-lg disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin mx-auto" /> : "יאללה מתחילים!"}
        </button>

        {!gameState?.session_id && (
          <div className="text-xs text-yellow-300/80 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
            אין session_id לחדר עדיין. המארח צריך להתחבר קודם.
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlayerJoinPage() {
  return (
    <Suspense fallback={<div className="bg-black h-screen text-white flex items-center justify-center">טוען...</div>}>
      <GameController />
    </Suspense>
  );
}