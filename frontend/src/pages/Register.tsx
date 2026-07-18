import { useState, type FormEvent } from "react";
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

  const handleRegister = async (e: FormEvent) => {
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
    <div className="min-h-screen flex items-center justify-center bg-brand-black relative overflow-hidden px-4 py-10">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-brand-blue/20 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 glass rounded-3xl p-8 max-w-md w-full"
      >
        <h1 className="text-xl font-bold mb-1">إنشاء حساب جديد</h1>
        <p className="text-neutral-400 text-sm mb-6">ابدأ بإزالة خلفيات شخصياتك الآن</p>

        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="اسم المستخدم"
            className="input-field"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="email"
            placeholder="البريد الإلكتروني"
            className="input-field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="كلمة المرور (8 أحرف على الأقل)"
            className="input-field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <input
            type="password"
            placeholder="تأكيد كلمة المرور"
            className="input-field"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />

          <label className="flex items-start gap-2 text-sm text-neutral-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="accent-brand-blue mt-1"
            />
            <span>أوافق على الشروط والأحكام وسياسة الخصوصية</span>
          </label>

          {error && (
            <div className="bg-red-950/60 border border-red-800/60 text-red-300 text-sm rounded-xl px-4 py-2.5">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "جارِ الإنشاء..." : "إنشاء الحساب"}
          </button>
        </form>

        <p className="text-center text-neutral-400 text-sm mt-6">
          لديك حساب بالفعل؟{" "}
          <Link to="/login" className="text-brand-blueGlow hover:underline">
            تسجيل الدخول
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
