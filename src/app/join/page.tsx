"use client";

import React, { useState, Suspense } from "react";
import { motion } from "framer-motion";
import { Upload, User, ArrowLeft, Camera, Check, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/app/lib/supabase";
import { useSearchParams } from "next/navigation";

// --- קומפוננטת הטופס הפנימית ---
function JoinForm() {
  const searchParams = useSearchParams();
  const hostId = searchParams.get('hostId');

  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other" | "">("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const compressedImage = await compressImage(file);
        setImagePreview(compressedImage);
      } catch (err) {
        console.error(err);
        alert("שגיאה בעיבוד התמונה");
      }
    }
  };

  const handleSubmit = async () => {
    if (!hostId) {
      setError("קוד משחק לא תקין (חסר מזהה מארח). נסה לסרוק שוב.");
      return;
    }
    if (!name || !gender) return alert("חובה למלא שם ומין!");
    
    setLoading(true);
    setError(null);

    try {
        const { error: insertError } = await supabase
            .from('players')
            .insert([
                { 
                    name, 
                    gender, 
                    avatar: imagePreview || `bg-${['red','blue','green','purple','pink'][Math.floor(Math.random()*5)]}-500`,
                    host_id: hostId
                }
            ]);

        if (insertError) throw insertError;
        setIsSubmitted(true);
    } catch (err: any) {
        console.error("Join Error:", err);
        setError("הייתה בעיה בהצטרפות. וודא שהמארח מחובר למשחק.");
    } finally {
        setLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center" dir="rtl">
        <motion.div 
          initial={{ scale: 0 }} 
          animate={{ scale: 1 }} 
          className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_#22c55e]"
        >
          <Check size={48} />
        </motion.div>
        <h1 className="text-3xl font-bold mb-2">אתה בפנים! 🔥</h1>
        <p className="text-gray-400">תסתכל על הטלוויזיה, השם שלך יופיע שם מיד.</p>
      </div>
    );
  }

  if (!hostId) {
     return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center" dir="rtl">
             <AlertTriangle className="text-red-500 w-16 h-16 mb-4" />
             <h1 className="text-2xl font-bold">שגיאה בחיבור</h1>
             <p className="text-gray-400 mt-2">לא נמצא קוד משחק. אנא סרוק את ה-QR שוב מהטלוויזיה.</p>
        </div>
     );
  }

  return (
    <div className="w-full max-w-md space-y-8 pb-10" dir="rtl">
        {/* העלאת תמונה */}
        <div className="flex justify-center">
          <div className="relative">
            <label htmlFor="avatar-upload" className="cursor-pointer group">
              <motion.div 
                whileHover={{ scale: 1.05 }}
                className={`w-32 h-32 rounded-full border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors ${imagePreview ? 'border-pink-500' : 'border-gray-600 group-hover:border-pink-500'}`}
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="text-gray-500 group-hover:text-pink-500 transition-colors" size={32} />
                )}
              </motion.div>
              <div className="absolute bottom-0 right-0 bg-pink-600 p-2 rounded-full shadow-lg">
                <Upload size={16} />
              </div>
            </label>
            <input id="avatar-upload" type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </div>
        </div>

        {/* שדה שם */}
        <div className="space-y-2">
          <label className="text-gray-400 text-sm font-bold uppercase tracking-wider">הכינוי שלך</label>
          <div className="relative">
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="איך קוראים לך?"
              className="w-full bg-gray-900/50 border border-gray-700 rounded-xl p-4 text-lg focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all placeholder:text-gray-600 text-right text-white"
            />
            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={20} />
          </div>
        </div>

        {/* בחירת מין */}
        <div className="space-y-2">
          <label className="text-gray-400 text-sm font-bold uppercase tracking-wider">מגדר (בשביל ה-AI)</label>
          <div className="grid grid-cols-3 gap-3">
            {[ { id: "male", label: "גבר" }, { id: "female", label: "אישה" }, { id: "other", label: "אחר" } ].map((option) => (
              <button
                key={option.id}
                onClick={() => setGender(option.id as any)}
                className={`p-3 rounded-xl border font-bold transition-all ${
                  gender === option.id 
                    ? 'bg-pink-600 border-pink-500 text-white shadow-[0_0_15px_rgba(236,72,153,0.4)]' 
                    : 'bg-gray-900 border-gray-800 text-gray-500 hover:border-gray-600'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
            <div className="text-red-400 text-sm text-center bg-red-900/20 p-3 rounded-lg border border-red-500/30">
                {error}
            </div>
        )}

        {/* כפתור סיום */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-gradient-to-l from-pink-600 via-purple-600 to-indigo-600 p-5 rounded-2xl font-black text-xl uppercase tracking-widest shadow-[0_0_20px_rgba(168,85,247,0.5)] flex items-center justify-center gap-2 mt-8 disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" /> : <>אני מוכן <ArrowLeft /></>}
        </motion.button>
    </div>
  );
}

// --- קומפוננטה ראשית (עוטפת ב-Suspense) ---
export default function PlayerJoinPage() {
    return (
        <div className="min-h-screen bg-black text-white p-6 flex flex-col items-center overflow-y-auto" dir="rtl">
            <motion.div 
                initial={{ y: -50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-full max-w-md mt-4 mb-8 text-center"
            >
                <h1 className="text-4xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500">
                הצטרף למסיבה
                </h1>
                <p className="text-gray-400 text-sm mt-1">הכנס את הפרטים כדי לשחק</p>
            </motion.div>
            
            <Suspense fallback={<div className="text-white">טוען נתונים...</div>}>
                <JoinForm />
            </Suspense>
        </div>
    );
}