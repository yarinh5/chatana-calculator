import type { ReactElement } from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import GuestList from "@/pages/GuestList";
import Admin from "@/pages/Admin";
import Pricing from "@/pages/Pricing";

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="size-8 animate-spin text-rose" />
    </div>
  );
}

function ProtectedRoute({ children, adminOnly }: { children: ReactElement; adminOnly?: boolean }) {
  const { session, isAdmin, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!session) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">העמוד לא נמצא</h2>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            חזרה לדף הבית
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/guests"
        element={
          <ProtectedRoute>
            <GuestList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute adminOnly>
            <Admin />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
