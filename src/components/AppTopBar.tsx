import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  BriefcaseBusiness,
  Calculator,
  LogOut,
  Shield,
  User as UserIcon,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/useWorkspace";
import type { SubscriptionState } from "@/hooks/useSubscription";
import { formatDateHe } from "@/lib/subscription";

export function AppTopBar({ subscription }: { subscription?: SubscriptionState }) {
  const { profile, isAdmin, signOut } = useAuth();
  const { workspaces, activeEventId, activeWorkspace, can, selectWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const onAdmin = location.pathname.startsWith("/admin");
  const onGuests = location.pathname.startsWith("/guests");
  const onWorkspace = location.pathname.startsWith("/workspace");
  const planLabel = getPlanLabel(subscription);
  const urgentTrial = subscription?.isTrialActive && subscription.daysRemaining <= 7;
  const showWorkspaceTools = !!activeWorkspace && can("workspace_manage");
  const showGuestsNav = !!activeWorkspace && can("guests_view");
  const showBudgetNav = !!activeWorkspace && can("budget_view");

  return (
    <div className="no-print sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3 md:px-6">
        <Link to="/" className="font-display text-base text-foreground sm:text-lg">
          <span className="sm:hidden">💍 WB IL</span>
          <span className="hidden sm:inline">💍 Wedding Budget IL</span>
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          {isAdmin && onAdmin && (
            <Link
              to="/dashboard"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-rose/15 px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-rose/40 hover:bg-rose/25"
            >
              <Calculator size={14} /> <span className="hidden sm:inline">המחשבון שלי</span>
            </Link>
          )}
          {!onAdmin && (
            <>
              {onGuests && showBudgetNav && (
                <Link
                  to="/dashboard"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-border hover:bg-secondary/80"
                >
                  <Calculator size={14} />
                  <span className="hidden sm:inline">מחשבון</span>
                </Link>
              )}
              {!onGuests && showGuestsNav && (
                <Link
                  to="/guests"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-border hover:bg-secondary/80"
                >
                  <Users size={14} />
                  <span className="hidden sm:inline">מוזמנים</span>
                </Link>
              )}
              {showWorkspaceTools && !onWorkspace && (
                <Link
                  to="/workspace"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-border hover:bg-secondary/80"
                >
                  <BriefcaseBusiness size={14} />
                  <span className="hidden sm:inline">שיתוף</span>
                </Link>
              )}
            </>
          )}
          {isAdmin && !onAdmin && (
            <Link
              to="/admin"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-gold/40 hover:bg-gold/25"
            >
              <Shield size={14} /> ניהול
            </Link>
          )}

          {workspaces.length > 1 && (
            <select
              aria-label="בחירת Workspace"
              value={activeEventId ?? ""}
              onChange={(event) => selectWorkspace(event.target.value)}
              className="min-h-9 max-w-[150px] rounded-full border border-border bg-card px-2 text-xs text-foreground sm:max-w-[220px]"
            >
              {workspaces.map((workspace) => (
                <option key={workspace.event_id} value={workspace.event_id}>
                  {workspace.event_name}
                  {workspace.is_owner ? " · שלי" : ""}
                </option>
              ))}
            </select>
          )}

          <div className="hidden max-w-[180px] items-center gap-1.5 truncate rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground md:inline-flex">
            <UserIcon size={14} />{" "}
            <span className="truncate">{profile?.full_name ?? profile?.email}</span>
          </div>
          {planLabel && (
            <Link
              to="/pricing"
              className={`inline-flex min-h-9 max-w-[170px] items-center truncate rounded-full px-3 py-1.5 text-xs font-semibold ring-1 sm:max-w-none ${
                subscription?.isExpired
                  ? "bg-destructive/10 text-destructive ring-destructive/30"
                  : urgentTrial
                    ? "bg-gold/20 text-foreground ring-gold/50"
                    : "bg-card text-muted-foreground ring-border hover:bg-secondary"
              }`}
            >
              <span className="truncate">{planLabel}</span>
            </Link>
          )}
          <button
            onClick={async () => {
              await signOut();
              navigate("/login");
            }}
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

function getPlanLabel(subscription?: SubscriptionState) {
  if (!subscription || subscription.loading) return null;
  if (subscription.isPremiumActive) {
    return `Premium · פעיל עד ${formatDateHe(subscription.expiresAt)}`;
  }
  if (subscription.isTrialActive) return `ניסיון חינם · ${subscription.daysRemaining} ימים`;
  if (subscription.isExpired) return "פג תוקף";
  return null;
}
