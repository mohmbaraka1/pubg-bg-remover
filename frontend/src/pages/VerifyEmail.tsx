import { motion } from "framer-motion";
import { Link } from "react-router-dom";

export default function VerifyEmail() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-black relative overflow-hidden px-4">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-brand-blue/20 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 glass rounded-3xl p-10 max-w-md w-full text-center"
      >
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-brand-blue to-blue-700 flex items-center justify-center text-3xl">
          ✉️
        </div>
        <h1 className="text-xl font-bold mb-2">تحقق من بريدك الإلكتروني</h1>
        <p className="text-neutral-400 text-sm mb-8">
          أرسلنا رابط تفعيل لبريدك الإلكتروني. اضغط عليه لتفعيل حسابك، ثم عد
          هنا لتسجيل الدخول.
        </p>
        <Link to="/login" className="btn-primary inline-block text-center">
          الذهاب لتسجيل الدخول
        </Link>
      </motion.div>
    </div>
  );
}
