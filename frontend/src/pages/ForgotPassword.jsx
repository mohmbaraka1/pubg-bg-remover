import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
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
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 relative overflow-hidden px-4">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 bg-neutral-900 border border-neutral-800 rounded-3xl p-8 max-w-md w-full"
      >
        <h1 className="text-xl font-bold mb-1 text-neutral-100">استعادة كلمة المرور</h1>

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
                className="bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2.5 text-neutral-100 outline-none focus:border-amber-500 transition-colors"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
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
                {loading ? "جارِ الإرسال..." : "إرسال رابط الاستعادة"}
              </button>
            </form>
          </>
        )}

        <p className="text-center text-neutral-400 text-sm mt-6">
          <Link to="/login" className="text-amber-400 hover:underline">
            العودة لتسجيل الدخول
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
