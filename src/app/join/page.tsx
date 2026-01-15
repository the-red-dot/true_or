// src\app\join\page.tsx

"use client";

import React, { useState, useEffect, Suspense } from "react";
import { Upload, ArrowLeft, Camera, Loader2, AlertTriangle, ThumbsUp, ThumbsDown, Beer, XCircle, Play, Flame } from "lucide-react";
import { supabase } from "@/app/lib/supabase";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";

// --- סוגי אירועים לשידור ---
type GameEvent = {
  type: 'emoji' | 'action_skip' | 'action_done' | 'vote_like' | 'vote_dislike' | 'vote_shot';
  payload: any;
  playerId: string;
};

const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

function GameController() {
  const searchParams = useSearchParams();
  const hostId = searchParams.get('hostId');

  // State
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other" | "">("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  
  // State עבור השחקן הפעיל (בקרים)
  const [localHeatLevel, setLocalHeatLevel] = useState(1);

  // --- בדיקת הרשמה ---
  useEffect(() => {
      if (hostId) {
          const storedId = localStorage.getItem(`player_id_${hostId}`);
          if (storedId) {
              setMyPlayerId(storedId);
              setIsSubmitted(true);
          }
      }
  }, [hostId]);

  // --- האזנה למצב המשחק ---
  useEffect(() => {
      if (!hostId || !myPlayerId) return;

      supabase.from('game_states').select('*').eq('host_id', hostId).single()
        .then(({ data }) => { 
            if (data) {
                setGameState(data);
                if (data.heat_level) setLocalHeatLevel(data.heat_level);
            }
        });

      const channel = supabase
        .channel(`gamestate_listener_${hostId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_states', filter: `host_id=eq.${hostId}` }, 
        (payload) => {
            setGameState(payload.new);
            // אם מישהו אחר עדכן את החום, נעדכן גם אצלנו (אלא אם זה התור שלנו, אז אנחנו שולטים)
            if (payload.new.heat_level && payload.new.current_player_id !== myPlayerId) {
                setLocalHeatLevel(payload.new.heat_level);
            }
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
  }, [hostId, myPlayerId]);

  // --- שידור פעולות ---
  const sendAction = async (type: GameEvent['type'], payload: any = {}) => {
      if (!hostId || !myPlayerId) return;
      await supabase.channel(`room_${hostId}`).send({
          type: 'broadcast',
          event: 'game_event',
          payload: { type, payload, playerId: myPlayerId }
      });
  };

  // --- עדכון מצב המשחק (עבור השחקן הפעיל) ---
  const updateGameState = async (updates: any) => {
      if (!hostId) return;
      await supabase.from('game_states').update(updates).eq('host_id', hostId);
  };

  const handleSpin = async () => {
      // עדכון ה-DB למצב ספינינג. הטלוויזיה תקשיב ותפעיל אנימציה
      await updateGameState({ status: 'spinning', heat_level: localHeatLevel });
  };

  const handleHeatChange = async (val: number) => {
      setLocalHeatLevel(val);
      // עדכון בזמן אמת ב-DB כדי שהטלוויזיה תציג
      await updateGameState({ heat_level: val });
  };

  const handleDone = async () => {
      // חזרה ללובי אחרי הצלחה
      sendAction('vote_like'); // אופציונלי: לשלוח לייק אוטומטי
      await updateGameState({ status: 'lobby' });
  };

  const handleSkip = async () => {
      // מעבר למצב עונש
      await updateGameState({ status: 'penalty' });
      // הטלוויזיה תטפל בטיימר ובחזרה ללובי
  };

  // --- לוגיקת העלאת תמונה והרשמה ---
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxWidth = 300;
          const scaleSize = maxWidth / img.width;
          canvas.width = maxWidth;
          canvas.height = img.height * scaleSize;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
      };
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        try {
            const compressed = await compressImage(file);
            setImagePreview(compressed);
        } catch { alert("שגיאה בתמונה"); }
    }
  };

  const handleJoin = async () => {
    if (!name || !gender) return alert("חסר שם או מין");
    setLoading(true);
    const newPlayerId = generateUUID();
    try {
        const { error } = await supabase.from('players').insert([{
            id: newPlayerId,
            name, gender, host_id: hostId,
            avatar: imagePreview || `bg-pink-500`
        }]);
        if (error) throw error;
        setMyPlayerId(newPlayerId);
        localStorage.setItem(`player_id_${hostId}`, newPlayerId);
        setIsSubmitted(true);
    } catch (e) {
        alert("שגיאה בהצטרפות");
    } finally {
        setLoading(false);
    }
  };

  // --- ממשק שלט ---
  if (isSubmitted && myPlayerId) {
      const isMyTurn = gameState?.current_player_id === myPlayerId;
      const status = gameState?.status || 'lobby';

      return (
          <div className="fixed inset-0 bg-gray-900 text-white flex flex-col overflow-hidden" dir="rtl">
              
              {/* Header - Safe Area Top */}
              <div className="w-full bg-gray-800 p-4 pt-safe-top flex justify-between items-center shadow-md z-20">
                  <div className="font-bold">{name}</div>
                  <div className={`px-2 py-0.5 rounded text-xs font-bold ${isMyTurn ? 'bg-pink-500 animate-pulse' : 'bg-green-600'}`}>
                      {isMyTurn ? 'תורך!' : 'מחובר'}
                  </div>
              </div>

              {/* Main Scrollable Area */}
              <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center pb-32">
                  
                  {/* --- תצוגה לשחקן הפעיל --- */}
                  {isMyTurn && status === 'lobby' && (
                      <div className="w-full max-w-sm space-y-8 animate-in fade-in slide-in-from-bottom-10">
                          <div className="text-center">
                              <h2 className="text-3xl font-black text-pink-500 mb-2">הכוח בידיים שלך!</h2>
                              <p className="text-gray-400">בחר את רמת החום וסובב</p>
                          </div>
                          
                          <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                              <div className="flex justify-between items-center mb-4">
                                  <span className="flex items-center gap-2 font-bold"><Flame className="text-pink-500"/> חום: {localHeatLevel}</span>
                                  <span className="text-xs text-gray-500 bg-black/30 px-2 py-1 rounded">
                                      {localHeatLevel < 4 ? "קליל" : localHeatLevel < 8 ? "לוהט" : "אקסטרים"}
                                  </span>
                              </div>
                              <input 
                                type="range" min="1" max="10" 
                                value={localHeatLevel} 
                                onChange={(e) => handleHeatChange(parseInt(e.target.value))}
                                className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
                              />
                          </div>

                          <button 
                            onClick={handleSpin}
                            className="w-full py-6 bg-gradient-to-r from-pink-600 to-purple-600 rounded-2xl font-black text-2xl shadow-[0_0_20px_rgba(236,72,153,0.4)] flex items-center justify-center gap-3 active:scale-95 transition-transform"
                          >
                              <Play fill="white" /> סובב את הגלגל!
                          </button>
                      </div>
                  )}

                  {isMyTurn && (status === 'challenge' || status === 'revealing') && (
                      <div className="w-full max-w-sm space-y-6">
                           <div className="bg-gray-800 p-6 rounded-2xl border-2 border-pink-500 shadow-xl">
                               <h2 className="text-2xl font-black mb-2 text-pink-400">המשימה שלך!</h2>
                               <p className="text-lg leading-relaxed">
                                   {gameState?.challenge_text || "טוען משימה..."}
                               </p>
                           </div>

                           <div className="grid grid-cols-2 gap-4">
                               <button onClick={handleSkip} className="bg-red-900/50 border border-red-500 text-red-200 py-4 rounded-xl font-bold flex flex-col items-center justify-center gap-1 active:scale-95">
                                   <XCircle /> אני מוותר (שוט)
                               </button>
                               <button onClick={handleDone} className="bg-green-600 text-white py-4 rounded-xl font-bold flex flex-col items-center justify-center gap-1 active:scale-95 shadow-lg">
                                   <ThumbsUp /> ביצעתי!
                               </button>
                           </div>
                      </div>
                  )}

                  {/* --- תצוגה לשאר השחקנים --- */}
                  {!isMyTurn && (
                      <div className="text-center w-full">
                          {status === 'lobby' && <div className="text-gray-500 animate-pulse">ממתינים ל-{gameState.heat_level ? 'סיבוב' : 'מארח'}...</div>}
                          {status === 'spinning' && <div className="text-6xl animate-spin">🎲</div>}
                          {status === 'challenge' && (
                              <div className="space-y-4">
                                  <h3 className="font-bold text-gray-400">הצבע לביצוע:</h3>
                                  <div className="flex justify-center gap-4">
                                      <button onClick={() => sendAction('vote_like')} className="p-4 bg-gray-800 rounded-full text-green-500 border border-green-500/30 active:scale-90"><ThumbsUp size={32}/></button>
                                      <button onClick={() => sendAction('vote_dislike')} className="p-4 bg-gray-800 rounded-full text-red-500 border border-red-500/30 active:scale-90"><ThumbsDown size={32}/></button>
                                      <button onClick={() => sendAction('vote_shot')} className="p-4 bg-gray-800 rounded-full text-yellow-500 border border-yellow-500/30 active:scale-90"><Beer size={32}/></button>
                                  </div>
                              </div>
                          )}
                      </div>
                  )}
              </div>

              {/* Footer / Emoji Bar - Always Visible */}
              <div className="w-full bg-gray-900/90 backdrop-blur border-t border-gray-800 p-4 pb-safe-bottom z-20">
                  <div className="flex justify-between gap-3 overflow-x-auto pb-2 scrollbar-hide">
                      {['😂','😱','😍','🤢','😈','🫣','🔥','💩'].map((emoji, idx) => (
                          <button 
                            key={idx}
                            onClick={() => sendAction('emoji', emoji)}
                            className="flex-shrink-0 w-12 h-12 bg-gray-800 rounded-xl text-2xl flex items-center justify-center shadow active:scale-90 transition-transform"
                          >
                              {emoji}
                          </button>
                      ))}
                  </div>
              </div>
          </div>
      );
  }

  // --- תצוגת הרשמה (Login) ---
  if (!hostId) return <div className="flex items-center justify-center h-screen text-white bg-black"><AlertTriangle className="mr-2 text-red-500"/> שגיאה בקוד החדר</div>;

  return (
    <div className="min-h-screen bg-black text-white p-6 flex flex-col items-center justify-center" dir="rtl">
        <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500 mb-8">הצטרפות למשחק</h1>
        
        <div className="w-full max-w-xs space-y-6">
            <div className="flex justify-center">
                <label className="relative cursor-pointer">
                    <div className={`w-32 h-32 rounded-full border-4 border-dashed flex items-center justify-center overflow-hidden bg-gray-900 ${imagePreview ? 'border-pink-500' : 'border-gray-700'}`}>
                        {imagePreview ? <img src={imagePreview} className="w-full h-full object-cover" /> : <Camera className="text-gray-500" size={32} />}
                    </div>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </label>
            </div>

            <input 
                type="text" value={name} onChange={(e) => setName(e.target.value)} 
                placeholder="הכינוי שלך" 
                className="w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-center focus:border-pink-500 outline-none" 
            />

            <div className="grid grid-cols-3 gap-2">
                {[ { id: "male", label: "גבר" }, { id: "female", label: "אישה" }, { id: "other", label: "אחר" } ].map((opt) => (
                    <button key={opt.id} onClick={() => setGender(opt.id as any)} className={`p-3 rounded-xl border text-sm font-bold ${gender === opt.id ? 'bg-pink-600 border-pink-500' : 'bg-gray-900 border-gray-800'}`}>{opt.label}</button>
                ))}
            </div>

            <button onClick={handleJoin} disabled={loading} className="w-full bg-white text-black py-4 rounded-xl font-black text-lg shadow-lg active:scale-95 disabled:opacity-50">
                {loading ? <Loader2 className="animate-spin mx-auto"/> : "יאללה פנימה!"}
            </button>
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