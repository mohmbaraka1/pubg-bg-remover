import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("الرجاء تعبئة البريد الإلكتروني وكلمة المرور.");
      return;
    }

    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (signInError) {
      if (signInError.message.includes("Invalid login credentials")) {
        setError("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
      } else if (signInError.message.includes("Email not confirmed")) {
        setError("الرجاء تفعيل بريدك الإلكتروني أولاً (تحقق من صندوق الوارد).");
      } else {
        setError(signInError.message);
      }
      return;
    }

    navigate("/dashboard");
  };

  const handleOAuth = async (provider) => {
    setError("");
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (oauthError) setError(oauthError.message);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 relative overflow-hidden px-4">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 bg-neutral-900 border border-neutral-800 rounded-3xl p-8 max-w-md w-full"
      >
        <h1 className="text-xl font-bold mb-1 text-neutral-100">تسجيل الدخول</h1>
        <p className="text-neutral-400 text-sm mb-6">أهلاً بعودتك 👋</p>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="البريد الإلكتروني"
            className="bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2.5 text-neutral-100 outline-none focus:border-amber-500 transition-colors"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="كلمة المرور"
            className="bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2.5 text-neutral-100 outline-none focus:border-amber-500 transition-colors"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-neutral-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="accent-amber-500"
              />
              تذكرني
            </label>
            <Link to="/forgot-password" className="text-amber-400 hover:underline">
              نسيت كلمة المرور؟
            </Link>
          </div>

          {error && (
            <div className="bg-red-950 border border-red-800 text-red-300 text-sm rounded-xl px-4 py-2.5">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-700 disabled:cursor-not-allowed text-neutral-950 font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            {loading ? "جارِ الدخول..." : "تسجيل الدخول"}
          </button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-neutral-800" />
          <span className="text-neutral-500 text-xs">أو الدخول عبر</span>
          <div className="flex-1 h-px bg-neutral-800" />
        </div>

        <div className="flex flex-col gap-3">
          <button
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-100 font-medium px-5 py-2.5 rounded-xl transition-colors"
            onClick={() => handleOAuth("google")}
          >
            المتابعة عبر Google
          </button>
          <button
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-100 font-medium px-5 py-2.5 rounded-xl transition-colors"
            onClick={() => handleOAuth("github")}
          >
            المتابعة عبر GitHub
          </button>
          <button
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-100 font-medium px-5 py-2.5 rounded-xl transition-colors"
            onClick={() => handleOAuth("apple")}
          >
            المتابعة عبر Apple
          </button>
        </div>

        <p className="text-center text-neutral-400 text-sm mt-6">
          ليس لديك حساب؟{" "}
          <Link to="/register" className="text-amber-400 hover:underline">
            إنشاء حساب جديد
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
