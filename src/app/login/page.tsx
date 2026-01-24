// src/app/login/page.tsx

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Mail, ArrowRight, Loader2, PartyPopper, Hash, Gamepad2 } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  // State for toggling between Host Login and Join Game
  const [activeTab, setActiveTab] = useState<'host' | 'player'>('host');

  // Host State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  
  // Player State
  const [roomCode, setRoomCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleHostLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Success
      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message === "Invalid login credentials" ? "פרטים שגויים, נסה שוב" : err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinWithCode = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(null);

      try {
          if (!roomCode || roomCode.length < 3) throw new Error("קוד חדר לא תקין");

          // Search for the game state with this room code
          const { data, error } = await supabase
            .from("game_states")
            .select("host_id")
            .eq("room_code", roomCode.toUpperCase())
            .single();

          if (error || !data) {
              throw new Error("לא מצאתי חדר עם הקוד הזה.");
          }

          // Found it! Redirect to join page
          router.push(`/join?hostId=${data.host_id}`);

      } catch (err: any) {
          setError(err.message);
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden" dir="rtl">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/30 via-black to-black z-0 pointer-events-none" />
      
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl z-10"
      >
        <div className="text-center mb-8">
          <PartyPopper className="w-16 h-16 mx-auto text-pink-500 mb-4" />
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500">
            ברוכים הבאים
          </h1>
          <p className="text-gray-400 mt-2">המרכז של אמת או חובה</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-black/40 rounded-xl p-1 mb-6">
            <button 
                onClick={() => { setActiveTab('host'); setError(null); }}
                className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'host' ? 'bg-pink-600 text-white shadow-lg' : 'text-gray-400 hover:bg-white/5'}`}
            >
                כניסת מארח
            </button>
            <button 
                onClick={() => { setActiveTab('player'); setError(null); }}
                className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${activeTab === 'player' ? 'bg-cyan-600 text-white shadow-lg' : 'text-gray-400 hover:bg-white/5'}`}
            >
                יש לי קוד
            </button>
        </div>

        <AnimatePresence mode="wait">
            {activeTab === 'host' ? (
                <motion.form 
                    key="host-form"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    onSubmit={handleHostLogin} 
                    className="space-y-6"
                >
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-500">אימייל</label>
                        <div className="relative">
                            <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-black/50 border border-gray-700 rounded-xl p-4 pl-12 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all outline-none"
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
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-black/50 border border-gray-700 rounded-xl p-4 pl-12 focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all outline-none"
                            placeholder="••••••••"
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
                        className="w-full bg-gradient-to-r from-pink-600 to-purple-600 p-4 rounded-xl font-bold text-lg hover:shadow-[0_0_20px_rgba(236,72,153,0.4)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <>התחבר <ArrowRight size={20} /></>}
                    </button>

                    <div className="mt-4 text-center text-gray-400 text-sm">
                        עדיין אין לך חשבון?{" "}
                        <Link href="/register" className="text-pink-400 hover:text-pink-300 font-bold underline decoration-pink-500/30 hover:decoration-pink-500">
                            הירשם כאן
                        </Link>
                    </div>
                </motion.form>
            ) : (
                <motion.form 
                    key="player-form"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    onSubmit={handleJoinWithCode} 
                    className="space-y-6"
                >
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-gray-500">קוד חדר</label>
                        <div className="relative">
                            <input
                            type="text"
                            required
                            value={roomCode}
                            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                            className="w-full bg-black/50 border border-gray-700 rounded-xl p-4 pl-12 text-center text-2xl font-mono tracking-widest uppercase focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all outline-none"
                            placeholder="AB12CD"
                            maxLength={6}
                            />
                            <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                        </div>
                        <p className="text-xs text-gray-500 text-center">הקוד מופיע בראש המסך של המארח</p>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-xl text-sm text-center">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 p-4 rounded-xl font-bold text-lg hover:shadow-[0_0_20px_rgba(8,145,178,0.4)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <>הצטרף למשחק <Gamepad2 size={20} /></>}
                    </button>
                </motion.form>
            )}
        </AnimatePresence>

      </motion.div>
    </div>
  );
}