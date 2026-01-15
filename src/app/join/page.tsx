"use client";

import React, { useState, useEffect, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Upload, ArrowLeft, Camera, Check, Loader2, AlertTriangle, 
  ThumbsUp, ThumbsDown, Beer, XCircle, Flame, Gamepad2 
} from "lucide-react";
import { supabase } from "@/app/lib/supabase";
import { useSearchParams } from "next/navigation";

// --- Types ---
type GameEvent = {
  type: 'emoji' | 'action_skip' | 'vote_like' | 'vote_dislike' | 'vote_shot' | 'remote_spin';
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

  // State להרשמה
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other" | "">("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // State למשחק פעיל
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [localHeat, setLocalHeat] = useState(1); // שליטה מקומית ברמת החום

  useEffect(() => {
      if (hostId) {
          const storedId = localStorage.getItem(`player_id_${hostId}`);
          if (storedId) {
              setMyPlayerId(storedId);
              setIsSubmitted(true);
          }
      }
  }, [hostId]);

  // האזנה למצב המשחק + שליפת מצב ראשוני
  useEffect(() => {
      if (!hostId || !myPlayerId) return;

      supabase.from('game_states').select('*').eq('host_id', hostId).single()
        .then(({ data }) => { 
            if (data) {
                setGameState(data);
                if (data.heat_level) setLocalHeat(data.heat_level);
            }
        });

      const channel = supabase
        .channel(`gamestate_listener_${hostId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_states', filter: `host_id=eq.${hostId}` }, 
        (payload) => {
            setGameState(payload.new);
            // לא דורסים את ה-heat המקומי אם המשתמש בדיוק מזיז אותו, 
            // אבל אפשר לעדכן כשמצב המשחק משתנה משמעותית
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
  }, [hostId, myPlayerId]);

  const sendAction = async (type: GameEvent['type'], payload: any = {}) => {
      if (!hostId || !myPlayerId) return;
      await supabase.channel(`room_${hostId}`).send({
          type: 'broadcast',
          event: 'game_event',
          payload: { type, payload, playerId: myPlayerId }
      });
  };

  const handleSpin = async () => {
    // שליחת פקודת ספין ועדכון רמת החום ב-DB
    if(!hostId) return;
    
    // עדכון בסיס הנתונים כדי שהטלוויזיה תדע שמתחילים
    await supabase.from('game_states').update({
        status: 'spinning',
        heat_level: localHeat
    }).eq('host_id', hostId);
  };

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
        console.error(e);
        alert("שגיאה בהצטרפות");
    } finally {
        setLoading(false);
    }
  };

  // --- Render Control UI ---
  if (isSubmitted && myPlayerId) {
      const isMyTurn = gameState?.current_player_id === myPlayerId;
      const isMyControl = gameState?.controlling_player_id === myPlayerId; // האם תורי לשלוט (לסובב)
      const status = gameState?.status || 'lobby';

      return (
          <div className="fixed inset-0 bg-gray-900 text-white flex flex-col overflow-hidden safe-area-padding" dir="rtl">
              {/* Header Compact */}
              <div className="flex-none bg-gray-800 p-3 shadow-md border-b border-gray-700 flex justify-between items-center z-10">
                  <div className="font-bold text-sm truncate max-w-[150px]">{name}</div>
                  <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/>
                      <span className="text-xs text-gray-400 font-mono">ONLINE</span>
                  </div>
              </div>

              {/* Main Action Area - No Scroll */}
              <div className="flex-1 relative flex flex-col items-center justify-center p-4 w-full max-w-md mx-auto">
                  
                  {/* מצב 1: תורי לשלוט (לסובב) */}
                  {isMyControl && status === 'lobby' && (
                      <div className="w-full space-y-8 animate-in fade-in zoom-in duration-300">
                           <div className="text-center">
                               <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400 mb-2">
                                   השרביט אצלך! 🪄
                               </h2>
                               <p className="text-gray-400 text-sm">בחר את רמת החום וסובב</p>
                           </div>

                           <div className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700">
                               <div className="flex justify-between items-center mb-4">
                                   <label className="font-bold flex items-center gap-2"><Flame className="text-orange-500" size={20}/> רמת חום: {localHeat}</label>
                                   <span className="text-xs bg-gray-700 px-2 py-1 rounded">{localHeat < 5 ? 'רגוע' : 'לוהט'}</span>
                               </div>
                               <input 
                                   type="range" min="1" max="10" 
                                   value={localHeat}
                                   onChange={(e) => setLocalHeat(parseInt(e.target.value))}
                                   className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
                               />
                               <div className="flex justify-between text-[10px] text-gray-500 mt-2 px-1">
                                   <span>😇</span><span>😈</span><span>🔥</span><span>🔞</span>
                               </div>
                           </div>

                           <button 
                               onClick={handleSpin}
                               className="w-full py-6 bg-gradient-to-r from-pink-600 to-purple-600 rounded-2xl font-black text-3xl shadow-[0_0_30px_rgba(236,72,153,0.4)] active:scale-95 transition-all flex items-center justify-center gap-3"
                           >
                               <Gamepad2 size={32} /> סובב!
                           </button>
                      </div>
                  )}

                  {/* מצב 2: תורי לשחק (משימה) */}
                  {isMyTurn && (status === 'challenge' || status === 'revealing') && (
                      <div className="w-full space-y-6 animate-in slide-in-from-bottom duration-500">
                          <div className="text-center">
                              <h2 className="text-3xl font-black text-pink-400 mb-2">תורך!</h2>
                              <p className="text-lg font-bold">{gameState?.challenge_type === 'אמת' ? '🤔 ענה בכנות' : '🔥 בצע את המשימה'}</p>
                          </div>
                          
                          <div className="flex flex-col gap-4">
                               <button 
                                  onClick={() => sendAction('vote_like')} // במקרה זה, השחקן מאשר שהוא ביצע
                                  className="w-full bg-green-600 py-6 rounded-2xl font-black text-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                               >
                                   <Check size={28} /> בוצע!
                               </button>

                               <button 
                                  onClick={() => sendAction('action_skip')}
                                  className="w-full bg-red-600/20 border-2 border-red-600 py-4 rounded-2xl font-bold text-xl text-red-100 shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                               >
                                   <XCircle size={24} /> אני מוותר (שוט)
                               </button>
                          </div>
                          <p className="text-center text-xs text-gray-500 mt-4">לחיצה על "בוצע" תעביר את השליטה אליך</p>
                      </div>
                  )}

                  {/* מצב 3: צופה / ממתין */}
                  {(!isMyControl && !isMyTurn) && (
                      <div className="text-center space-y-4 opacity-80">
                          {status === 'spinning' ? (
                              <div className="text-6xl animate-spin">🎲</div>
                          ) : (
                              <>
                                  <div className="text-4xl animate-pulse">👀</div>
                                  <h3 className="text-xl font-bold">ממתינים...</h3>
                                  {status === 'lobby' && <p className="text-sm text-gray-400">מחכים לסיבוב הגלגל</p>}
                                  {status === 'challenge' && <p className="text-sm text-gray-400">הצביעו על הביצוע!</p>}
                              </>
                          )}
                          
                          {/* כפתורי הצבעה לצופים בזמן משימה */}
                          {status === 'challenge' && (
                              <div className="grid grid-cols-2 gap-3 w-full mt-6">
                                  <button onClick={() => sendAction('vote_like')} className="bg-green-800/50 p-4 rounded-xl text-green-400 border border-green-600/30 active:bg-green-700/50"><ThumbsUp className="mx-auto mb-1"/> אהבתי</button>
                                  <button onClick={() => sendAction('vote_dislike')} className="bg-red-800/50 p-4 rounded-xl text-red-400 border border-red-600/30 active:bg-red-700/50"><ThumbsDown className="mx-auto mb-1"/> בוז</button>
                                  <button onClick={() => sendAction('vote_shot')} className="col-span-2 bg-orange-600/30 p-3 rounded-xl text-orange-400 border border-orange-500/30 active:bg-orange-600/50 flex justify-center gap-2 font-bold"><Beer size={20}/> כולם שותים!</button>
                              </div>
                          )}
                      </div>
                  )}
              </div>

              {/* Emoji Footer - Fixed Bottom */}
              <div className="flex-none bg-gray-800/80 backdrop-blur border-t border-gray-700 p-3 pb-8 safe-area-bottom">
                  <p className="text-center text-[10px] text-gray-500 mb-2 uppercase tracking-widest font-bold">תגובה מהירה</p>
                  <div className="flex justify-between gap-2 overflow-x-auto no-scrollbar touch-pan-x">
                      {[ '😂', '😱', '😍', '🤢', '😈', '🫣', '🍻' ].map((icon, idx) => (
                          <button 
                            key={idx}
                            onClick={() => sendAction('emoji', icon)}
                            className="flex-shrink-0 w-12 h-12 bg-gray-700 rounded-full text-2xl flex items-center justify-center shadow-lg active:scale-90 transition-transform border border-gray-600"
                          >
                              {icon}
                          </button>
                      ))}
                  </div>
              </div>
          </div>
      );
  }

  // --- תצוגת הרשמה ---
  if (!hostId) return <div className="text-white p-10 text-center flex flex-col items-center justify-center h-screen"><AlertTriangle size={48} className="text-red-500 mb-4"/>קוד משחק שגוי</div>;

  return (
    <div className="min-h-screen bg-black text-white p-6 flex flex-col items-center justify-center safe-area-padding" dir="rtl">
        <div className="w-full max-w-md space-y-8">
            <div className="flex justify-center">
              <label className="cursor-pointer group relative">
                <motion.div whileTap={{ scale: 0.95 }} className={`w-32 h-32 rounded-full border-4 border-dashed flex items-center justify-center overflow-hidden transition-colors ${imagePreview ? 'border-pink-500' : 'border-gray-600'}`}>
                  {imagePreview ? <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" /> : <Camera className="text-gray-500" size={32} />}
                </motion.div>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            </div>

            <div className="space-y-4">
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="הכינוי שלך" className="w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-white text-right focus:border-pink-500 outline-none transition-colors text-lg" />
                
                <div className="grid grid-cols-3 gap-3">
                    {[ { id: "male", label: "גבר" }, { id: "female", label: "אישה" }, { id: "other", label: "אחר" } ].map((option) => (
                      <button key={option.id} onClick={() => setGender(option.id as any)} className={`p-4 rounded-xl border font-bold transition-all ${gender === option.id ? 'bg-pink-600 border-pink-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-500'}`}>{option.label}</button>
                    ))}
                </div>
            </div>

            <button onClick={handleJoin} disabled={loading} className="w-full bg-gradient-to-l from-pink-600 via-purple-600 to-indigo-600 p-5 rounded-2xl font-black text-xl text-white shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50">
              {loading ? <Loader2 className="animate-spin" /> : <>הצטרף למשחק <ArrowLeft /></>}
            </button>
        </div>
    </div>
  );
}

export default function PlayerJoinPage() {
    return (
        <Suspense fallback={<div className="bg-black h-screen w-screen flex items-center justify-center text-white">טוען...</div>}>
            <GameController />
        </Suspense>
    );
}