// src/app/join/page.tsx
"use client";

import React, { Suspense } from "react";
import { motion } from "framer-motion";
import {
  Camera, Loader2, AlertTriangle, Beer, XCircle, Flame, RefreshCw, LogOut,
  MessageCircleQuestion, Zap, ShieldCheck // הוספתי ShieldCheck לאייקון הבטיחות
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
    // משתנים חדשים לבטיחות
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

  // 1. Error State
  if (!hostId) {
    return (
      <div className="text-white p-10 text-center flex flex-col items-center justify-center h-screen bg-black" dir="rtl">
        <AlertTriangle size={48} className="text-red-500 mb-4" />
        קוד משחק שגוי
      </div>
    );
  }

  const isAnonymous = (authUser as any)?.is_anonymous === true;

  // 2. Controller View (Active Game)
  if (isSubmitted && myPlayerId && gameState) {
    const isMyTurnToPlay = gameState.current_player_id === myPlayerId;
    const isMyTurnToSpin =
      gameState.last_active_player_id === myPlayerId &&
      (gameState.status === "lobby" || gameState.status === "waiting_for_spin");
    
    const isWaitingForChoice = gameState.status === "waiting_for_choice";

    return (
      <div className="fixed inset-0 bg-gray-900 text-white flex flex-col overflow-hidden" dir="rtl">
        {/* Header */}
        <div className="pt-4 px-4 pb-2 bg-gray-800/50 backdrop-blur-md border-b border-gray-700/50 flex justify-between items-center z-10">
          <div className="flex items-center gap-3">
            {imagePreview && <img src={imagePreview} className="w-8 h-8 rounded-full object-cover border border-white" />}
            <span className="font-bold truncate max-w-[140px]">{name}</span>
          </div>
          <div className="flex gap-2 items-center">
            <div className="text-[10px] px-2 py-1 bg-green-500/20 text-green-400 rounded-full border border-green-500/30 flex items-center">
              {isAnonymous ? "מחובר" : "מחובר"}
            </div>
            <button onClick={handleLeaveGame} className="p-1 bg-red-500/20 text-red-400 rounded-lg" title="צא מהמשחק">
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col justify-center items-center p-6 relative w-full max-w-md mx-auto overflow-y-auto">
          
          {/* SPIN CONTROLS */}
          {isMyTurnToSpin && !isWaitingForChoice && (
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full space-y-6">
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

          {/* CHOICE CONTROLS */}
          {isWaitingForChoice && isMyTurnToPlay && (
             <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full space-y-4">
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

          {/* OTHER PLAYER ACTIONS */}
          {!isMyTurnToSpin && !isWaitingForChoice && (
            <div className="w-full space-y-6">
              
              {/* Active Player Controls (Challenge Phase) */}
              {isMyTurnToPlay && gameState.status === "challenge" && (
                <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full">
                  <div className="bg-gray-800/90 p-6 rounded-3xl border-2 border-pink-500 shadow-2xl mb-4 text-center">
                    <h2 className="text-3xl font-black text-pink-400 mb-2">תורך!</h2>
                    <p className="text-white/80 text-lg">{gameState.challenge_type}</p>
                  </div>

                  <button
                    onClick={() => sendVote("action_skip")}
                    className="w-full py-5 bg-red-500/20 hover:bg-red-500/30 text-red-200 border-2 border-red-500 rounded-2xl font-bold text-xl flex items-center justify-center gap-3 active:scale-95 transition-all"
                  >
                    <XCircle /> אני מוותר (עונש!)
                  </button>
                  <p className="text-center text-xs text-gray-500 mt-2">לחיצה תעביר את התור</p>
                </motion.div>
              )}

              {/* Spectator View */}
              {!isMyTurnToPlay && gameState.status === "challenge" && (
                <div className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700">
                  <h3 className="text-center font-bold mb-4 text-gray-300">מה דעתך על הביצוע?</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => sendVote("vote_like")} className="bg-green-600/80 p-4 rounded-xl flex justify-center active:scale-95 text-2xl hover:bg-green-500 transition-colors">👍</button>
                    <button onClick={() => sendVote("vote_dislike")} className="bg-red-600/80 p-4 rounded-xl flex justify-center active:scale-95 text-2xl hover:bg-red-500 transition-colors">👎</button>
                  </div>
                  <button onClick={() => sendVote("vote_shot")} className="w-full mt-3 bg-orange-600/80 p-3 rounded-xl font-bold flex justify-center items-center gap-2 active:scale-95 hover:bg-orange-500 transition-colors">
                    <Beer size={18} /> כולם שותים!
                  </button>
                </div>
              )}

              {/* Status Texts */}
              {gameState.status !== "challenge" && (
                <div className="text-center text-gray-400 animate-pulse">
                  {gameState.status === "spinning" && <div className="text-6xl animate-spin mb-4">🎲</div>}
                  
                  {gameState.status === "waiting_for_choice" && (
                     <div className="flex flex-col items-center">
                         <div className="text-6xl mb-4 animate-bounce">🤔</div>
                         <p className="text-2xl font-bold text-white mb-2">ממתינים לבחירה...</p>
                         {!isMyTurnToPlay && <p className="text-sm">השחקן חושב כרגע</p>}
                     </div>
                  )}
                  
                  <p className="text-xl font-bold">
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

        {/* Emoji Bar */}
        <div className="w-full pt-3 pb-6 bg-gray-900 border-t border-gray-800 z-10">
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

  // 3. Registration View
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

        {/* Safety Settings Card - החדש! */}
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