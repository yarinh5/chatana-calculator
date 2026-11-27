import { lazy, Suspense, type ReactElement } from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
const Landing = lazy(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const GuestList = lazy(() => import("@/pages/GuestList"));
const Admin = lazy(() => import("@/pages/Admin"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const Workspace = lazy(() => import("@/pages/Workspace"));
const WorkspaceJoin = lazy(() => import("@/pages/WorkspaceJoin"));
const Rsvp = lazy(() => import("@/pages/Rsvp"));
const PublicRsvp = lazy(() => import("@/pages/PublicRsvp"));
const Vendors = lazy(() => import("@/pages/Vendors"));
const SeatingStudio = lazy(() => import("@/pages/SeatingStudio"));
const Scenarios = lazy(() => import("@/pages/Scenarios"));
const Tasks = lazy(() => import("@/pages/Tasks"));
const Documents = lazy(() => import("@/pages/Documents"));
const TransportPlanner = lazy(() => import("@/pages/TransportPlanner"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const MarketPrices = lazy(() => import("@/pages/MarketPrices"));

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
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/rsvp/:token" element={<PublicRsvp />} />
        <Route path="/workspace/join/:token" element={<WorkspaceJoin />} />
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
          path="/workspace"
          element={
            <ProtectedRoute>
              <Workspace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/rsvp"
          element={
            <ProtectedRoute>
              <Rsvp />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vendors"
          element={
            <ProtectedRoute>
              <Vendors />
            </ProtectedRoute>
          }
        />
        <Route
          path="/seating"
          element={
            <ProtectedRoute>
              <SeatingStudio />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tasks"
          element={
            <ProtectedRoute>
              <Tasks />
            </ProtectedRoute>
          }
        />
        <Route
          path="/documents"
          element={
            <ProtectedRoute>
              <Documents />
            </ProtectedRoute>
          }
        />
        <Route
          path="/transport"
          element={
            <ProtectedRoute>
              <TransportPlanner />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <Notifications />
            </ProtectedRoute>
          }
        />
        <Route
          path="/market-prices"
          element={
            <ProtectedRoute>
              <MarketPrices />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scenarios"
          element={
            <ProtectedRoute>
              <Scenarios />
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
    </Suspense>
  );
}
