import { Link, useNavigate, useLocation } from "react-router-dom";
import { Calculator, LogOut, Shield, User as UserIcon, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function AppTopBar() {
  const { profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const onAdmin = location.pathname.startsWith("/admin");

  return (
    <div className="no-print sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3 md:px-6">
        <Link to="/" className="font-display text-base text-foreground sm:text-lg">
          <span className="sm:hidden">💍 WB IL</span>
          <span className="hidden sm:inline">💍 Wedding Budget IL</span>
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          {isAdmin && onAdmin && (
            <Link to="/dashboard" className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-rose/15 px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-rose/40 hover:bg-rose/25">
              <Calculator size={14} /> <span className="hidden sm:inline">המחשבון שלי</span>
            </Link>
          )}
          {!onAdmin && (
            <Link to="/guests" className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-border hover:bg-secondary/80">
              <Users size={14} /> <span className="hidden sm:inline">מוזמנים</span>
            </Link>
          )}
          {isAdmin && !onAdmin && (
            <Link to="/admin" className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-gold/40 hover:bg-gold/25">
              <Shield size={14} /> ניהול
            </Link>
          )}

          <div className="hidden max-w-[180px] items-center gap-1.5 truncate rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground md:inline-flex">
            <UserIcon size={14} /> <span className="truncate">{profile?.full_name ?? profile?.email}</span>
          </div>
          <button
            onClick={async () => { await signOut(); navigate("/login"); }}
            aria-label="התנתק"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs hover:bg-secondary"
          >
            <LogOut size={14} /> <span className="hidden sm:inline">התנתק</span>
          </button>
        </div>
      </div>
    </div>
  );
}
