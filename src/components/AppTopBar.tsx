import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Shield, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function AppTopBar() {
  const { profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="no-print sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 md:px-6">
        <Link to="/" className="font-display text-lg text-foreground">💍 Wedding Budget IL</Link>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link to="/admin" className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-gold/40 hover:bg-gold/25">
              <Shield size={14} /> ניהול
            </Link>
          )}
          <div className="hidden items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground sm:inline-flex">
            <UserIcon size={14} /> {profile?.full_name ?? profile?.email}
          </div>
          <button
            onClick={async () => { await signOut(); navigate({ to: "/login" }); }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary"
          >
            <LogOut size={14} /> התנתק
          </button>
        </div>
      </div>
    </div>
  );
}
