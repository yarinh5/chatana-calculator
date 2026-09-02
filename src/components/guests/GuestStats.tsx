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
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-foreground">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function GuestStats({ stats, totalExpenses }: { stats: Stats; totalExpenses: number }) {
  const profit = stats.totalGifts - totalExpenses;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Users size={14} className="text-rose" />}
          label='סה"כ מוזמנים'
          value={String(stats.totalInvited)}
          sub="אורחים"
        />
        <StatCard
          icon={<UserCheck size={14} className="text-emerald-600" />}
          label="הגיעו"
          value={`${stats.arrivedCount} / ${stats.totalInvited}`}
          sub={`${stats.arrivedRate}%`}
        />
        <StatCard
          icon={<Gift size={14} className="text-gold" />}
          label='סה"כ מתנות'
          value={formatILS(stats.totalGifts)}
        />
        <StatCard
          icon={<Mail size={14} className="text-rose" />}
          label="ממוצע למעטפה"
          value={formatILS(Math.round(stats.avgGift))}
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
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
                  ? "flex items-center gap-1 text-lg font-bold text-emerald-600"
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
