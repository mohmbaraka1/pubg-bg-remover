import { BrowserRouter, Routes, Route } from "react-router-dom";
import Welcome from "./pages/Welcome";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import VerifyEmail from "./pages/VerifyEmail";
import ProtectedRoute from "./components/ProtectedRoute";
import BackgroundRemover from "./components/BackgroundRemover";
import DashboardLayout from "./components/DashboardLayout";
import DashboardHome from "./pages/dashboard/DashboardHome";
import MyAccounts from "./pages/dashboard/MyAccounts";
import AccountWorkspace from "./pages/dashboard/AccountWorkspace";
import DesignResources from "./pages/dashboard/DesignResources";
import AIAssets from "./pages/dashboard/AIAssets";
import DesignStudio from "./pages/dashboard/DesignStudio";
import History from "./pages/dashboard/History";
import Favorites from "./pages/dashboard/Favorites";
import Settings from "./pages/dashboard/Settings";
import Profile from "./pages/dashboard/Profile";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />

        {/* أداة إزالة الخلفية الحالية - بدون تغيير */}
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <BackgroundRemover />
            </ProtectedRoute>
          }
        />

        {/* الهيكلة الاحترافية (المرحلة الثالثة) */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardHome />} />
          <Route path="accounts" element={<MyAccounts />} />
          <Route path="accounts/:id" element={<AccountWorkspace />} />
          <Route path="resources" element={<DesignResources />} />
          <Route path="ai-assets" element={<AIAssets />} />
          <Route path="studio" element={<DesignStudio />} />
          <Route path="history" element={<History />} />
          <Route path="favorites" element={<Favorites />} />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
