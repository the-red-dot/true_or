// src/app/join/page.tsx

"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Upload, User, ArrowRight, Camera, Check } from "lucide-react";

export default function PlayerJoinPage() {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other" | "">("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // טיפול בהעלאת תמונה
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = () => {
    if (!name || !gender) return alert("חובה למלא שם ומין!");
    
    // כאן בעתיד נשלח את הנתונים לשרת (Firebase/Socket)
    // כרגע נדמה הצלחה
    setIsSubmitted(true);
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ scale: 0 }} 
          animate={{ scale: 1 }} 
          className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_#22c55e]"
        >
          <Check size={48} />
        </motion.div>
        <h1 className="text-3xl font-bold mb-2">אתה בפנים! 🔥</h1>
        <p className="text-gray-400">תסתכל על הטלוויזיה, המשחק עומד להתחיל...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6 flex flex-col items-center">
      {/* כותרת */}
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-md mt-4 mb-8 text-center"
      >
        <h1 className="text-4xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500">
          JOIN THE PARTY
        </h1>
        <p className="text-gray-400 text-sm mt-1">הכנס את הפרטים כדי לשחק</p>
      </motion.div>

      <div className="w-full max-w-md space-y-8">
        
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
            <input 
              id="avatar-upload" 
              type="file" 
              accept="image/*" 
              onChange={handleImageUpload} 
              className="hidden" 
            />
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
              className="w-full bg-gray-900/50 border border-gray-700 rounded-xl p-4 text-lg focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all placeholder:text-gray-600"
            />
            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={20} />
          </div>
        </div>

        {/* בחירת מין (חשוב ל-AI) */}
        <div className="space-y-2">
          <label className="text-gray-400 text-sm font-bold uppercase tracking-wider">מגדר (בשביל ה-AI)</label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: "male", label: "גבר" },
              { id: "female", label: "אישה" },
              { id: "other", label: "אחר" }
            ].map((option) => (
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

        {/* כפתור סיום */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleSubmit}
          className="w-full bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 p-5 rounded-2xl font-black text-xl uppercase tracking-widest shadow-[0_0_20px_rgba(168,85,247,0.5)] flex items-center justify-center gap-2 mt-8"
        >
          אני מוכן <ArrowRight />
        </motion.button>

      </div>
    </div>
  );
}