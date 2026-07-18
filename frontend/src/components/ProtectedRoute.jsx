import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

// يمنع الوصول لأداة إزالة الخلفية إلا بعد تسجيل الدخول.
export default function ProtectedRoute({ children }) {
  const [status, setStatus] = useState("checking"); // checking | authed | guest

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setStatus(data.session ? "authed" : "guest");
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? "authed" : "guest");
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-400">
        جارِ التحقق من تسجيل الدخول...
      </div>
    );
  }

  if (status === "guest") {
    return <Navigate to="/login" replace />;
  }

  return children;
}
