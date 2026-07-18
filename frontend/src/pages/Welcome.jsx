import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

export default function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 relative overflow-hidden px-4">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 bg-neutral-900 border border-neutral-800 rounded-3xl p-10 max-w-md w-full text-center"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-2xl font-bold text-neutral-950"
        >
          BG
        </motion.div>

        <h1 className="text-2xl font-bold mb-2 text-neutral-100">Background Remover</h1>
        <p className="text-neutral-400 text-sm mb-8">
          استخرج شخصيتك من PUBG Mobile بخلفية شفافة احترافية، بضغطة زر واحدة.
        </p>

        <div className="flex flex-col gap-3">
          <button
            className="bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold px-5 py-2.5 rounded-xl transition-colors"
            onClick={() => navigate("/register")}
          >
            إنشاء حساب جديد
          </button>
          <button
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-100 font-medium px-5 py-2.5 rounded-xl transition-colors"
            onClick={() => navigate("/login")}
          >
            لدي حساب بالفعل — تسجيل الدخول
          </button>
        </div>
      </motion.div>
    </div>
  );
}
