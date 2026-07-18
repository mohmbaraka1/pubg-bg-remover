import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email) {
      setError("الرجاء إدخال بريدك الإلكتروني.");
      return;
    }

    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-black relative overflow-hidden px-4">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-brand-blue/20 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 glass rounded-3xl p-8 max-w-md w-full"
      >
        <h1 className="text-xl font-bold mb-1">استعادة كلمة المرور</h1>

        {sent ? (
          <p className="text-neutral-300 text-sm mt-4">
            أرسلنا رابط استعادة كلمة المرور لبريدك الإلكتروني. تحقق من صندوق الوارد.
          </p>
        ) : (
          <>
            <p className="text-neutral-400 text-sm mb-6">
              أدخل بريدك الإلكتروني وسنرسل لك رابط استعادة كلمة المرور.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input
                type="email"
                placeholder="البريد الإلكتروني"
                className="input-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {error && (
                <div className="bg-red-950/60 border border-red-800/60 text-red-300 text-sm rounded-xl px-4 py-2.5">
                  {error}
                </div>
              )}
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "جارِ الإرسال..." : "إرسال رابط الاستعادة"}
              </button>
            </form>
          </>
        )}

        <p className="text-center text-neutral-400 text-sm mt-6">
          <Link to="/login" className="text-brand-blueGlow hover:underline">
            العودة لتسجيل الدخول
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
