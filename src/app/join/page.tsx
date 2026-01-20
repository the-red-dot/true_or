// src/app/join/page.tsx
"use client";

import React, { Suspense, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Camera, Loader2, AlertTriangle, Beer, XCircle, Flame, LogOut,
  MessageCircleQuestion, Zap, ShieldCheck, Gavel, Check, ArrowRight, ArrowLeft
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { usePlayerGameLogic, PENALTIES_LIST } from "@/app/hooks/usePlayerGameLogic";

function GameController() {
  const searchParams = useSearchParams();
  const hostId = searchParams.get("hostId");

  const {
    name, setName,
    gender, setGender,
    imagePreview, handleImageUpload,
    isAdult, setIsAdult,
    personalMaxHeat, setPersonalMaxHeat,
    
    isSubmitted,
    loading,
    authReady,
    authUser,
    gameState,
    localHeat,
    myPlayerId,
    victimIsAdult,
    victimGender, 
    allPlayers, // רשימת כל השחקנים
    hasVoted, // האם המשתמש כבר הצביע
    handleJoin,
    handleLeaveGame,
    handleSpin,
    handleHeatChange,
    sendEmoji,
    sendVote,
    sendChoice,
    sendPenaltyPreview,
    sendPenaltySelection
  } = usePlayerGameLogic(hostId);

  // State for carousel
  const [penaltyIndex, setPenaltyIndex] = useState(0);

  // --- Logic for Group Shot Button ---
  const showShotButton = useMemo(() => {
      // עדכון: מציג את הכפתור אם יש לפחות 2 שחקנים (במקום 3) כדי להקל על בדיקות ומשחקים קטנים
      return allPlayers.length >= 2;
  }, [allPlayers.length]);

  const enableShotButton = useMemo(() => {
      if (allPlayers.length === 0) return false;
      const adultsCount = allPlayers.filter(p => p.is_adult).length;
      return (adultsCount / allPlayers.length) > 0.5;
  }, [allPlayers]);

  // --- Helpers for Icons (Copied for consistency on mobile) ---
  const renderPenaltyIcon = (type: string | undefined) => {
      switch (type) {
          case 'lemon': return <div className="text-6xl">🍋</div>;
          case 'vinegar': return <div className="text-6xl">🫗</div>; 
          case 'onion': return <div className="text-6xl">🧅</div>; 
          case 'garlic': return <div className="text-6xl">🧄</div>;
          case 'water': return <div className="text-6xl">💦</div>;
          case 'ice': return <div className="text-6xl">🧊</div>;
          case 'shot': return <Beer size={60} className="text-yellow-400" />;
          case 'kiss_wall': return <div className="text-6xl">💋</div>;
          case 'squats': return <div className="text-6xl">🏋️</div>;
          case 'tea_bag': return <div className="text-6xl">🍵</div>;
          case 'pasta': return <div className="text-6xl">🍝</div>;
          case 'lipstick': return <div className="text-6xl">💄</div>;
          case 'oil': return <div className="text-6xl">🥄</div>;
          case 'chili': return <div className="text-6xl">🌶️</div>;
          default: return <div className="text-6xl">😈</div>;
      }
  };

  const t = (male: string, female: string) => {
      return gender === 'female' ? female : male;
  }

  const validPenalties = useMemo(() => {
      return PENALTIES_LIST.filter(p => {
          if (p.is18 && !victimIsAdult) return false;
          return true;
      });
  }, [victimIsAdult]);

  const currentPenaltyData = useMemo(() => {
      if (validPenalties.length === 0) return null;
      const safeIndex = penaltyIndex % validPenalties.length; 
      const p = validPenalties[safeIndex];
      const g = victimGender === 'female' ? 'female' : 'male';
      return {
          type: p.type,
          is18: p.is18,
          ...p.gendered[g]
      };
  }, [validPenalties, penaltyIndex, victimGender]);

  
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

  if (isSubmitted && myPlayerId && gameState) {
    const isMyTurnToPlay = gameState.current_player_id === myPlayerId;
    const isController = gameState.last_active_player_id === myPlayerId;
    
    const isMyTurnToSpin = isController &&
      (gameState.status === "lobby" || gameState.status === "waiting_for_spin");
    
    const isWaitingForChoice = gameState.status === "waiting_for_choice";
    const isChoosingPenalty = gameState.status === "choosing_penalty" && isController;

    const nextPenalty = () => {
        const next = (penaltyIndex + 1) % validPenalties.length;
        setPenaltyIndex(next);
        const pRaw = validPenalties[next];
        const g = victimGender === 'female' ? 'female' : 'male';
        const pResolved = {
            type: pRaw.type,
            text: pRaw.gendered[g].text,
            description: pRaw.gendered[g].description
        };
        sendPenaltyPreview(pResolved);
    }

    const prevPenalty = () => {
        const prev = (penaltyIndex - 1 + validPenalties.length) % validPenalties.length;
        setPenaltyIndex(prev);
        const pRaw = validPenalties[prev];
        const g = victimGender === 'female' ? 'female' : 'male';
        const pResolved = {
            type: pRaw.type,
            text: pRaw.gendered[g].text,
            description: pRaw.gendered[g].description
        };
        sendPenaltyPreview(pResolved);
    }

    const confirmPenalty = () => {
        if (!currentPenaltyData) return;
        sendPenaltySelection(currentPenaltyData);
    }

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
                  {gameState.status === "lobby" ? t("אתה מתחיל!", "את מתחילה!") : t("השרביט אצלך!", "השרביט אצלך!")}
                </h2>
                <p className="text-gray-400 text-sm">בחר רמת חום וסובב</p>
              </div>

              <div className="bg-gray-800/80 p-5 rounded-3xl border border-gray-700 shadow-xl">
                <div className="flex justify-between items-center mb-4">
                  <span className="flex items-center gap-2 font-bold text-xl text-orange-400">
                    <Flame className="fill-orange-400" /> {localHeat}
                  </span>
                  <span className="text-xs text-gray-400 uppercase tracking-widest">
                    {localHeat === 1 ? "קליל" : localHeat === 2 ? "נועז" : "לוהט"}
                  </span>
                </div>
                
                <div className="flex gap-2 justify-between mb-2">
                    {[1, 2, 3].map((level) => (
                        <button
                            key={level}
                            onClick={() => handleHeatChange(level)}
                            disabled={level > personalMaxHeat}
                            className={`
                                flex-1 py-3 rounded-xl flex flex-col items-center transition-all duration-200
                                ${localHeat === level 
                                    ? 'bg-gradient-to-t from-orange-600 to-yellow-500 text-black shadow-lg scale-105 border-2 border-yellow-300' 
                                    : 'bg-gray-700 text-gray-400 border border-gray-600'}
                                ${level > personalMaxHeat ? 'opacity-30 cursor-not-allowed grayscale' : ''}
                            `}
                        >
                            <span className="text-xl mb-1">{level === 1 ? '🔥' : level === 2 ? '🔥🔥' : '🔥🔥🔥'}</span>
                            <span className="text-[10px] font-bold">{level === 1 ? 'קליל' : level === 2 ? 'נועז' : 'לוהט'}</span>
                        </button>
                    ))}
                </div>

                <div className="text-[10px] text-gray-500 mt-2 text-center">
                    מוגבל למקסימום {personalMaxHeat} לפי הגדרות הבטיחות שלך
                </div>
              </div>

              <button
                onClick={handleSpin}
                className="w-full py-6 bg-gradient-to-r from-pink-600 to-purple-600 rounded-3xl font-black text-3xl shadow-[0_0_30px_rgba(236,72,153,0.4)] active:scale-95 transition-transform flex items-center justify-center gap-3"
              >
                <div className="text-4xl">🍾</div>
                {gameState.status === "lobby" ? "מתחילים!" : t("סובב את הבקבוק", "סובבי את הבקבוק")}
              </button>
            </motion.div>
          )}

          {/* PENALTY SELECTION CONTROLS (Only for Controller) */}
          {isChoosingPenalty && currentPenaltyData && (
              <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full text-center">
                  <div className="mb-4">
                      <Gavel className="mx-auto text-purple-500 mb-2" size={40} />
                      <h2 className="text-2xl font-black text-white">
                          {victimGender === 'female' ? "היא ויתרה!" : "הוא ויתר!"}
                      </h2>
                      <p className="text-gray-300 text-sm">
                          {gender === 'female' ? "בחרי" : "בחר"} {victimGender === 'female' ? "לה" : "לו"} עונש מהרשימה
                      </p>
                  </div>

                  <div className="bg-gray-800 border-2 border-purple-500 rounded-3xl p-6 mb-6 shadow-2xl relative overflow-hidden">
                      <div className="flex justify-center mb-4">
                          {renderPenaltyIcon(currentPenaltyData.type)}
                      </div>
                      <h3 className="text-xl font-bold mb-2">{currentPenaltyData.text}</h3>
                      <p className="text-xs text-gray-400 italic mb-4">"{currentPenaltyData.description}"</p>
                      
                      {currentPenaltyData.is18 && (
                          <div className="absolute top-2 right-2 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full">
                              18+
                          </div>
                      )}

                      <div className="flex justify-between items-center mt-4">
                          <button onClick={prevPenalty} className="p-3 bg-gray-700 rounded-full hover:bg-gray-600 active:scale-90 transition-transform">
                              <ArrowRight size={24} />
                          </button>
                          <span className="text-xs text-gray-500">{penaltyIndex + 1} / {validPenalties.length}</span>
                          <button onClick={nextPenalty} className="p-3 bg-gray-700 rounded-full hover:bg-gray-600 active:scale-90 transition-transform">
                              <ArrowLeft size={24} />
                          </button>
                      </div>
                  </div>

                  <button 
                    onClick={confirmPenalty}
                    className="w-full py-4 bg-purple-600 rounded-2xl font-bold text-xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  >
                      <Check size={24} /> בחר עונש זה
                  </button>
                  <p className="text-[10px] text-gray-500 mt-2 animate-pulse">הבחירה משודרת למסך בזמן אמת</p>
              </motion.div>
          )}

          {/* CHOICE CONTROLS */}
          {isWaitingForChoice && isMyTurnToPlay && (
             <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full space-y-4">
               <div className="text-center mb-6">
                 <h2 className="text-4xl font-black text-white">{t("תורך לבחור!", "תורך לבחור!")}</h2>
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
          {!isMyTurnToSpin && !isWaitingForChoice && !isChoosingPenalty && (
            <div className="w-full space-y-6">
              
              {/* Active Player Controls (Challenge Phase) */}
              {isMyTurnToPlay && gameState.status === "challenge" && (
                <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full">
                  
                  <div className="bg-gray-800/90 p-6 rounded-3xl border-2 border-pink-500 shadow-2xl mb-4 text-center relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pink-500 to-cyan-500" />
                      
                      <div className="mb-4">
                          <span className={`inline-block px-4 py-1 rounded-full text-sm font-black mb-2 ${
                              gameState.challenge_type === 'אמת' ? 'bg-blue-500/20 text-blue-400' : 'bg-pink-500/20 text-pink-400'
                          }`}>
                              {gameState.challenge_type}
                          </span>
                          <h2 className="text-2xl font-black text-white leading-tight" dir="rtl">
                              {gameState.challenge_text}
                          </h2>
                      </div>

                      {/* Heat Meter Compact for Mobile */}
                      <div className="flex justify-center gap-1 mb-6">
                          {Array.from({ length: 3 }).map((_, i) => (
                             <div
                                key={i}
                                className={`w-8 h-2 rounded-full ${
                                  i < (localHeat || 0)
                                    ? "bg-gradient-to-r from-orange-600 to-yellow-400"
                                    : "bg-gray-700/50"
                                }`}
                             />
                          ))}
                      </div>

                      <button
                        onClick={() => sendVote("action_skip")}
                        className="w-full py-4 bg-red-500/20 hover:bg-red-500/30 text-red-200 border-2 border-red-500 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 active:scale-95 transition-all"
                      >
                        <XCircle size={20} /> {t("אני מוותר (עונש!)", "אני מוותרת (עונש!)")}
                      </button>
                      <p className="text-center text-[10px] text-gray-500 mt-2">לחיצה תעביר את ההחלטה למחזיק בשרביט</p>
                  </div>
                </motion.div>
              )}

              {/* Spectator View */}
              {!isMyTurnToPlay && gameState.status === "challenge" && (
                <div className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700 relative">
                  {/* כיסוי כשכבר הצבעת */}
                  {hasVoted && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-2xl">
                          <span className="text-white font-bold bg-black/50 px-4 py-2 rounded-full border border-white/20">הצבעתך נקלטה! ✅</span>
                      </div>
                  )}

                  <h3 className="text-center font-bold mb-4 text-gray-300">מה דעתך על הביצוע?</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => sendVote("vote_like")} className="bg-green-600/80 p-4 rounded-xl flex justify-center active:scale-95 text-2xl hover:bg-green-500 transition-colors">👍</button>
                    <button onClick={() => sendVote("vote_dislike")} className="bg-red-600/80 p-4 rounded-xl flex justify-center active:scale-95 text-2xl hover:bg-red-500 transition-colors">👎</button>
                  </div>
                  
                  {showShotButton && (
                      <div className="mt-3">
                          <button 
                            onClick={() => sendVote("vote_shot")} 
                            disabled={!enableShotButton}
                            className={`
                                w-full p-3 rounded-xl font-bold flex justify-center items-center gap-2 transition-colors
                                ${enableShotButton 
                                    ? "bg-orange-600/80 active:scale-95 hover:bg-orange-500 text-white" 
                                    : "bg-gray-700/50 text-gray-500 cursor-not-allowed grayscale"}
                            `}
                          >
                            <Beer size={18} /> הפסקת שוט!
                          </button>
                          {enableShotButton ? (
                              <p className="text-[10px] text-orange-300/80 text-center mt-1 italic">
                                  מי שחוקי מרים, מי שלא - מדמיין 🧃
                              </p>
                          ) : (
                              <p className="text-[10px] text-gray-500 text-center mt-1">
                                  זמין רק כשרוב השחקנים 18+
                              </p>
                          )}
                      </div>
                  )}
                </div>
              )}

              {/* Status Texts */}
              {gameState.status !== "challenge" && (
                <div className="text-center text-gray-400 animate-pulse">
                  {gameState.status === "spinning" && <div className="text-6xl animate-spin mb-4">🍾</div>}
                  {gameState.status === "choosing_penalty" && <div className="text-6xl mb-4 animate-bounce">⚖️</div>}
                  {gameState.status === "penalty" && <div className="text-6xl mb-4">⚠️</div>}
                  
                  {gameState.status === "waiting_for_choice" && (
                     <div className="flex flex-col items-center">
                         <div className="text-6xl mb-4 animate-bounce">🤔</div>
                         <p className="text-2xl font-bold text-white mb-2">ממתינים לבחירה...</p>
                         {!isMyTurnToPlay && <p className="text-sm">{t("השחקן חושב", "השחקנית חושבת")} כרגע</p>}
                     </div>
                  )}
                  
                  <p className="text-xl font-bold">
                    {gameState.status === "lobby" ? "ממתינים למארח..." :
                     gameState.status === "waiting_for_spin" ? "ממתינים לסיבוב..." :
                     gameState.status === "spinning" ? "מגריל..." :
                     gameState.status === "penalty" ? "עונש!" : 
                     gameState.status === "choosing_penalty" ? "השרביט בוחר עונש..." :
                     gameState.status === "revealing" ? "מייצר משימה..." :
                     gameState.status === "waiting_for_choice" ? "" : "המשחק רץ בטלוויזיה..."}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {!isChoosingPenalty && (
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
        )}
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-black text-white p-6 flex flex-col items-center justify-center text-center" dir="rtl">
        {/* קוד הרשמה נשאר ללא שינוי, השארתי את הקומפוננטה המלאה למעלה */}
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
          {[{ id: "male", l: "גבר" }, { id: "female", l: "אישה" }].map((o) => (
            <button
              key={o.id}
              onClick={() => setGender(o.id as any)}
              className={`flex-1 py-3 rounded-lg border ${gender === o.id ? "bg-pink-600 border-pink-500" : "border-gray-800 bg-gray-900"}`}
            >
              {o.l}
            </button>
          ))}
        </div>

        <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 w-full text-right">
            <div className="flex items-center gap-2 mb-4 text-gray-300 border-b border-gray-700 pb-2">
                <ShieldCheck size={18} className="text-green-400" />
                <span className="font-bold text-sm">הגדרות בטיחות</span>
            </div>

            <div className="flex items-center justify-between mb-4">
                <label className="text-sm">אני {gender === 'female' ? "מעל" : "מעל"} גיל 18</label>
                <input 
                    type="checkbox" 
                    checked={isAdult} 
                    onChange={(e) => setIsAdult(e.target.checked)}
                    className="w-5 h-5 accent-pink-500"
                />
            </div>

            <div className="mb-2">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>חום מקסימלי עבורי: {personalMaxHeat === 1 ? "קליל" : personalMaxHeat === 2 ? "נועז" : "לוהט"}</span>
                    <span>{personalMaxHeat <= 2 ? "בטוח" : "נועז"}</span>
                </div>
                
                <div className="flex gap-2 justify-between mb-2 mt-2">
                    {[1, 2, 3].map((level) => (
                        <button
                            key={level}
                            onClick={() => setPersonalMaxHeat(level)}
                            disabled={!isAdult && level > 2}
                            className={`
                                flex-1 py-2 rounded-lg flex flex-col items-center transition-all duration-200
                                ${personalMaxHeat === level 
                                    ? 'bg-gradient-to-t from-orange-600 to-yellow-500 text-black shadow-lg border border-yellow-300' 
                                    : 'bg-gray-700 text-gray-400 border border-gray-600'}
                                ${!isAdult && level > 2 ? 'opacity-30 cursor-not-allowed grayscale' : ''}
                            `}
                        >
                            <span className="text-lg">{level === 1 ? '🔥' : level === 2 ? '🔥🔥' : '🔥🔥🔥'}</span>
                            <span className="text-[10px] font-bold">{level === 1 ? 'קליל' : level === 2 ? 'נועז' : 'לוהט'}</span>
                        </button>
                    ))}
                </div>

                <p className="text-[10px] text-gray-500 mt-2 leading-tight">
                    {isAdult 
                      ? "כמשתמש בוגר, באפשרותך לבחור כל רמת קושי." 
                      : "משתמשים מתחת לגיל 18 מוגבלים לרמה 2 ומטה."}
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