import { Users, UserCheck, Gift, Mail, TrendingUp, TrendingDown } from "lucide-react";
import { formatILS } from "@/lib/wedding-data";

type Stats = {
  totalInvited: number;
  arrivedCount: number;
  totalGifts: number;
  avgGift: number;
  arrivedRate: number;
};

function StatCard({
  icon,
  label,
  value,
  sub,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "success" | "danger";
}) {
  const toneRing =
    tone === "success" ? "ring-success/30" : tone === "danger" ? "ring-destructive/30" : "ring-border";
  const toneText =
    tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div
      className={`group rounded-2xl bg-card p-4 shadow-sm ring-1 transition-all duration-300 hover:shadow-md sm:p-5 ${toneRing}`}
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-medium sm:text-sm">{label}</span>
        <span className="text-rose">{icon}</span>
      </div>
      <div
        className={`mt-3 font-display text-2xl tabular-nums transition-all duration-300 sm:text-3xl ${toneText}`}
      >
        {value}
      </div>
      {sub && <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{sub}</p>}
    </div>
  );
}


export function GuestStats({ stats, totalExpenses }: { stats: Stats; totalExpenses: number }) {
  const profit = stats.totalGifts - totalExpenses;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          icon={<Users size={18} />}
          label='סה"כ מוזמנים'
          value={String(stats.totalInvited)}
          sub="אורחים ברשימה"
        />
        <StatCard
          icon={<UserCheck size={18} />}
          label="הגיעו בפועל"
          value={`${stats.arrivedCount} / ${stats.totalInvited}`}
          sub={`${stats.arrivedRate}% מהמוזמנים`}
          tone={stats.arrivedCount > 0 ? "success" : "neutral"}
        />
        <StatCard
          icon={<Gift size={18} />}
          label='סה"כ מתנות'
          value={formatILS(stats.totalGifts)}
        />
        <StatCard
          icon={<Mail size={18} />}
          label="ממוצע למעטפה"
          value={formatILS(Math.round(stats.avgGift))}
          sub="לפי מתנות שהתקבלו"
        />
      </div>

      <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border transition-all duration-300 hover:shadow-md sm:p-5">
        <div className="mb-3 font-display text-base text-foreground">💰 סיכום כספי מעודכן</div>

        <dl className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">סה״כ מתנות שהתקבלו</dt>
            <dd className="font-semibold text-foreground">{formatILS(stats.totalGifts)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">סה״כ הוצאות</dt>
            <dd className="font-semibold text-foreground">{formatILS(Math.round(totalExpenses))}</dd>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
            <dt className="text-muted-foreground">רווח / הפסד</dt>
            <dd
              className={
                profit >= 0
                  ? "flex items-center gap-1 text-lg font-bold text-success"
                  : "flex items-center gap-1 text-lg font-bold text-destructive"
              }
            >
              {profit >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              {formatILS(Math.round(profit))}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
