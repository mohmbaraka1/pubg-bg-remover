import { useState } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Register() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (!username || !email || !password || !confirmPassword) {
      setError("الرجاء تعبئة جميع الحقول.");
      return;
    }
    if (password.length < 8) {
      setError("كلمة المرور يجب أن تكون 8 أحرف على الأقل.");
      return;
    }
    if (password !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }
    if (!agreeTerms) {
      setError("يجب الموافقة على الشروط والأحكام للمتابعة.");
      return;
    }

    setLoading(true);
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo: `${window.location.origin}/verify-email`,
      },
    });
    setLoading(false);

    if (signUpError) {
      if (signUpError.message.includes("already registered")) {
        setError("هذا البريد الإلكتروني مسجل مسبقاً.");
      } else {
        setError(signUpError.message);
      }
      return;
    }

    navigate("/verify-email");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 relative overflow-hidden px-4 py-10">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 bg-neutral-900 border border-neutral-800 rounded-3xl p-8 max-w-md w-full"
      >
        <h1 className="text-xl font-bold mb-1 text-neutral-100">إنشاء حساب جديد</h1>
        <p className="text-neutral-400 text-sm mb-6">ابدأ بإزالة خلفيات شخصياتك الآن</p>

        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="اسم المستخدم"
            className="bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2.5 text-neutral-100 outline-none focus:border-amber-500 transition-colors"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
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
            placeholder="كلمة المرور (8 أحرف على الأقل)"
            className="bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2.5 text-neutral-100 outline-none focus:border-amber-500 transition-colors"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <input
            type="password"
            placeholder="تأكيد كلمة المرور"
            className="bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2.5 text-neutral-100 outline-none focus:border-amber-500 transition-colors"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />

          <label className="flex items-start gap-2 text-sm text-neutral-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="accent-amber-500 mt-1"
            />
            <span>أوافق على الشروط والأحكام وسياسة الخصوصية</span>
          </label>

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
            {loading ? "جارِ الإنشاء..." : "إنشاء الحساب"}
          </button>
        </form>

        <p className="text-center text-neutral-400 text-sm mt-6">
          لديك حساب بالفعل؟{" "}
          <Link to="/login" className="text-amber-400 hover:underline">
            تسجيل الدخول
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
