import { supabase } from "./supabase";

const ADMIN_EMAIL = "mohammedbaraka842@gmail.com";

// يرجّع صلاحيات المستخدم الحالي: أدمن كامل (بريدك، ثابت بالكود)، أو مصمم
// (مسجّل بجدول profiles بدور "designer")، أو زائر عادي بدون أي صلاحية إدارية.
export async function getUserAccess() {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { isAdmin: false, isDesigner: false, canUploadLibrary: false };

  if (user.email === ADMIN_EMAIL) {
    return { isAdmin: true, isDesigner: false, canUploadLibrary: true };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isDesigner = profile?.role === "designer";
  return { isAdmin: false, isDesigner, canUploadLibrary: isDesigner };
}
