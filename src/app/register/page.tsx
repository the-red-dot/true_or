// truth-or-dare-ai\src\app\register\page.tsx

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { motion } from "framer-motion";
import { Lock, Mail, ArrowRight, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      // הצלחה - מעבר לעמוד הראשי (או לעמוד הגדרות פרופיל אם תרצה בעתיד)
      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-900/30 via-black to-black z-0 pointer-events-none" />
      
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl z-10"
      >
        <div className="text-center mb-8">
          <Sparkles className="w-16 h-16 mx-auto text-cyan-400 mb-4 animate-pulse" />
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
            הצטרף למשחק
          </h1>
          <p className="text-gray-400 mt-2">צור חשבון ושמור את ההיסטוריה שלך</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-gray-500">אימייל</label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black/50 border border-gray-700 rounded-xl p-4 pl-12 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all outline-none"
                placeholder="you@party.com"
              />
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-gray-500">סיסמה</label>
            <div className="relative">
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/50 border border-gray-700 rounded-xl p-4 pl-12 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all outline-none"
                placeholder="לפחות 6 תווים"
              />
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-xl text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-cyan-600 to-purple-600 p-4 rounded-xl font-bold text-lg hover:shadow-[0_0_20px_rgba(8,145,178,0.4)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" /> : <>הירשם עכשיו <ArrowRight size={20} /></>}
          </button>
        </form>

        <div className="mt-8 text-center text-gray-400 text-sm">
          כבר יש לך חשבון?{" "}
          <Link href="/login" className="text-cyan-400 hover:text-cyan-300 font-bold underline decoration-cyan-500/30 hover:decoration-cyan-500">
            התחבר כאן
          </Link>
        </div>
      </motion.div>
    </div>
  );
}