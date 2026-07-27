// رابط الباك إند: فاضي بالتطوير المحلي (يعتمد على بروكسي Vite لـ /api)،
// ويُضبط بـ VITE_API_URL وقت بناء الإنتاج (دومين الباك إند الحقيقي بعد النشر).
export const API_BASE = import.meta.env.VITE_API_URL || "";

export const apiUrl = (path) => `${API_BASE}${path}`;
