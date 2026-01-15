// truth-or-dare-ai\src\app\join\page.tsx

"use client";

import React, { useState, useEffect, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, User, ArrowLeft, Camera, Check, Loader2, AlertTriangle, ThumbsUp, ThumbsDown, Beer, XCircle } from "lucide-react";
import { supabase } from "@/app/lib/supabase";
import { useSearchParams } from "next/navigation";

// --- סוגי אירועים לשידור ---
type GameEvent = {
  type: 'emoji' | 'action_skip' | 'vote_like' | 'vote_dislike' | 'vote_shot';
  payload: any;
  playerId: string;
};

// פונקציית עזר ליצירת מזהה ייחודי (כדי לא להסתמך על השרת ולעקוף RLS)
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// --- קומפוננטת השלט והטופס ---
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
  const [gameState, setGameState] = useState<any>(null); // המידע שמגיע מהטלוויזיה
  
  // בדיקה אם השחקן כבר רשום (למשל מריענון)
  useEffect(() => {
      if (hostId) {
          const storedId = localStorage.getItem(`player_id_${hostId}`);
          if (storedId) {
              setMyPlayerId(storedId);
              setIsSubmitted(true);
          }
      }
  }, [hostId]);

  // האזנה למצב המשחק (Game State) מהטלוויזיה
  useEffect(() => {
      if (!hostId || !myPlayerId) return;

      // 1. קריאה ראשונית של המצב
      supabase.from('game_states').select('*').eq('host_id', hostId).single()
        .then(({ data }) => { if (data) setGameState(data); });

      // 2. האזנה לשינויים בטבלת game_states
      const channel = supabase
        .channel(`gamestate_listener_${hostId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_states', filter: `host_id=eq.${hostId}` }, 
        (payload) => {
            setGameState(payload.new);
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
  }, [hostId, myPlayerId]);

  // פונקציית שידור פעולות (אימוג'ים, הצבעות) - נשלח לטלוויזיה בערוץ Broadcast
  const sendAction = async (type: GameEvent['type'], payload: any = {}) => {
      if (!hostId || !myPlayerId) return;
      await supabase.channel(`room_${hostId}`).send({
          type: 'broadcast',
          event: 'game_event',
          payload: { type, payload, playerId: myPlayerId }
      });
  };

  // --- לוגיקת הרשמה ---
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
    
    // יצירת מזהה בצד הלקוח (תיקון קריטי!)
    const newPlayerId = generateUUID();

    try {
        const { error } = await supabase.from('players').insert([{
            id: newPlayerId, // שולחים את ה-ID שיצרנו
            name, gender, host_id: hostId,
            avatar: imagePreview || `bg-pink-500`
        }]); // בלי .select() שגורם לשגיאת הרשאות

        if (error) throw error;
        
        // שמירת המזהה לשימוש בשלט
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

  // --- תצוגת השלט (אחרי הרשמה) ---
  if (isSubmitted && myPlayerId) {
      const isMyTurn = gameState?.current_player_id === myPlayerId;
      const status = gameState?.status || 'lobby';

      return (
          <div className="min-h-screen bg-gray-900 text-white p-4 flex flex-col items-center justify-between" dir="rtl">
              {/* Header */}
              <div className="w-full flex justify-between items-center mb-6 bg-gray-800 p-4 rounded-xl shadow-lg border border-gray-700">
                  <div className="font-bold text-lg">{name}</div>
                  <div className="text-xs px-2 py-1 bg-green-600 rounded text-white font-bold shadow animate-pulse">מחובר</div>
              </div>

              {/* Main Content Area */}
              <div className="flex-1 w-full flex flex-col items-center justify-center text-center space-y-6">
                  
                  {status === 'lobby' && (
                      <div className="animate-pulse text-xl text-gray-400 font-bold">ממתינים למארח שיתחיל...</div>
                  )}

                  {status === 'spinning' && (
                      <div className="text-5xl animate-spin">🎲</div>
                  )}

                  {status === 'spotlight' && (
                      <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500 animate-bounce">
                          {isMyTurn ? "😱 זה אתה!!" : "מי זה יהיה?..."}
                      </div>
                  )}

                  {/* מסך המשימה - החלק האינטרקטיבי המרכזי */}
                  {(status === 'challenge' || status === 'revealing') && (
                      <div className="w-full space-y-6">
                          {isMyTurn ? (
                              // --- תצוגה לשחקן הפעיל ---
                              <div className="bg-gray-800 p-6 rounded-2xl border-2 border-pink-500 shadow-[0_0_30px_rgba(236,72,153,0.3)]">
                                  <h2 className="text-3xl font-black mb-4 text-pink-400">התור שלך!</h2>
                                  <p className="text-xl mb-8 font-bold">{gameState?.challenge_type === 'אמת' ? '🤔 ענה על השאלה' : '🔥 בצע את המשימה'}</p>
                                  
                                  <button 
                                    onClick={() => sendAction('action_skip')}
                                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-5 px-6 rounded-2xl flex items-center justify-center gap-3 text-xl shadow-lg transform active:scale-95 transition-all border-b-4 border-red-800"
                                  >
                                      <XCircle size={28} /> אני מוותר (שוט!)
                                  </button>
                                  <p className="text-xs text-gray-400 mt-3 font-bold opacity-70">לחיצה תודיע לכולם שוויתרת</p>
                              </div>
                          ) : (
                              // --- תצוגה לשאר השחקנים (הצבעות) ---
                              <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-xl w-full">
                                  <h2 className="text-xl font-bold mb-6 text-gray-300">הצביעו לביצוע:</h2>
                                  <div className="grid grid-cols-2 gap-4 mb-4">
                                      <button onClick={() => sendAction('vote_like')} className="bg-green-600 p-5 rounded-xl flex flex-col items-center gap-2 active:bg-green-700 transition-all hover:scale-105 border-b-4 border-green-800 shadow-lg">
                                          <ThumbsUp size={36} />
                                          <span className="font-black text-lg">הושלם!</span>
                                      </button>
                                      <button onClick={() => sendAction('vote_dislike')} className="bg-red-600 p-5 rounded-xl flex flex-col items-center gap-2 active:bg-red-700 transition-all hover:scale-105 border-b-4 border-red-800 shadow-lg">
                                          <ThumbsDown size={36} />
                                          <span className="font-black text-lg">חלש...</span>
                                      </button>
                                  </div>
                                  <button onClick={() => sendAction('vote_shot')} className="w-full mt-2 bg-gradient-to-r from-orange-600 to-red-600 p-4 rounded-xl flex items-center justify-center gap-3 font-black text-lg active:scale-95 transition-all shadow-lg border border-orange-400/30">
                                      <Beer size={24} /> שכולם ישתו!
                                  </button>
                              </div>
                          )}
                      </div>
                  )}
              </div>

              {/* Emoji Bar - זמין תמיד לכולם */}
              <div className="w-full mt-auto pt-4 border-t border-gray-800/50">
                  <p className="text-center text-xs text-gray-500 mb-2 font-bold uppercase tracking-widest">שלח תגובה למסך</p>
                  <div className="flex justify-between gap-2 overflow-x-auto pb-2 scrollbar-hide">
                      {[
                          { icon: '😂', label: 'צחוק' },
                          { icon: '😱', label: 'שוק' },
                          { icon: '😍', label: 'לב' },
                          { icon: '🤢', label: 'איכס' },
                          { icon: '😈', label: 'פלירטוט' },
                          { icon: '🫣', label: 'מביך' }
                      ].map((item, idx) => (
                          <button 
                            key={idx}
                            onClick={() => sendAction('emoji', item.icon)}
                            className="bg-gray-800 p-3 rounded-2xl text-3xl hover:bg-gray-700 active:scale-90 transition-transform shadow-md border border-gray-700 flex-shrink-0"
                          >
                              {item.icon}
                          </button>
                      ))}
                  </div>
              </div>
          </div>
      );
  }

  // --- תצוגת הרשמה (ברירת מחדל) ---
  if (!hostId) return <div className="text-white p-10 text-center flex flex-col items-center justify-center h-screen"><AlertTriangle size={48} className="text-red-500 mb-4"/>קוד משחק שגוי</div>;

  return (
    <div className="w-full max-w-md space-y-8 pb-10" dir="rtl">
        <div className="flex justify-center">
          <div className="relative">
            <label htmlFor="avatar-upload" className="cursor-pointer group">
              <motion.div whileHover={{ scale: 1.05 }} className={`w-32 h-32 rounded-full border-4 border-dashed flex items-center justify-center overflow-hidden transition-colors ${imagePreview ? 'border-pink-500' : 'border-gray-600'}`}>
                {imagePreview ? <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" /> : <Camera className="text-gray-500" size={32} />}
              </motion.div>
            </label>
            <input id="avatar-upload" type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </div>
        </div>

        <div className="space-y-2">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="הכינוי שלך" className="w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-white text-right focus:border-pink-500 outline-none transition-colors" />
        </div>

        <div className="grid grid-cols-3 gap-3">
            {[ { id: "male", label: "גבר" }, { id: "female", label: "אישה" }, { id: "other", label: "אחר" } ].map((option) => (
              <button key={option.id} onClick={() => setGender(option.id as any)} className={`p-3 rounded-xl border font-bold transition-all ${gender === option.id ? 'bg-pink-600 border-pink-500 text-white shadow-[0_0_15px_rgba(236,72,153,0.4)]' : 'bg-gray-900 border-gray-800 text-gray-500'}`}>{option.label}</button>
            ))}
        </div>

        <button onClick={handleJoin} disabled={loading} className="w-full bg-gradient-to-l from-pink-600 via-purple-600 to-indigo-600 p-5 rounded-2xl font-black text-xl text-white shadow-lg flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100">
          {loading ? <Loader2 className="animate-spin" /> : <>הצטרף למשחק <ArrowLeft /></>}
        </button>
    </div>
  );
}

export default function PlayerJoinPage() {
    return (
        <div className="min-h-screen bg-black text-white p-6 flex flex-col items-center overflow-y-auto" dir="rtl">
            <Suspense fallback={<div className="text-white text-center mt-20">טוען משחק...</div>}><GameController /></Suspense>
        </div>
    );
}