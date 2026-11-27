import type { FinancialAmounts, FinancialSnapshot } from "@/lib/financial-domain";
import { CATEGORIES, formatILS, type CategoryKey } from "@/lib/wedding-data";
import type { VendorRow } from "@/lib/vendors";

type GroupRow = { key: string; label: string; amounts: FinancialAmounts };

function formatMaybeAmount(value: number | null, emptyText = "לא זמין") {
  return value === null ? emptyText : formatILS(value);
}

function BreakdownTable({ title, rows }: { title: string; rows: GroupRow[] }) {
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
      <h4 className="font-semibold text-foreground">{title}</h4>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">אין הוצאות להצגה.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[540px] text-right text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="py-2">{title === "לפי קטגוריה" ? "קטגוריה" : "ספק"}</th>
                <th>תכנון</th>
                <th>התחייבות</th>
                <th>שולם</th>
                <th>נותר</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="py-2 font-medium">
                    {row.label}
                  </th>
                  <td className="text-muted-foreground">
                    {formatMaybeAmount(row.amounts.planned, "טרם הוגדר")}
                  </td>
                  <td className="tabular-nums">{formatILS(row.amounts.committed)}</td>
                  <td className="tabular-nums">{formatMaybeAmount(row.amounts.paid)}</td>
                  <td className="tabular-nums">{formatMaybeAmount(row.amounts.remaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function FinancialBreakdown({
  snapshot,
  vendors,
}: {
  snapshot: FinancialSnapshot;
  vendors: VendorRow[] | null;
}) {
  const categoryRows: GroupRow[] = [...snapshot.categories]
    .map(([key, amounts]) => ({
      key,
      label: CATEGORIES[key as CategoryKey]?.label ?? key,
      amounts,
    }))
    .sort((a, b) => b.amounts.committed - a.amounts.committed);
  const vendorRows: GroupRow[] =
    vendors === null
      ? []
      : [...snapshot.vendors]
          .map(([key, amounts]) => ({
            key,
            label: vendors.find((vendor) => vendor.id === key)?.business_name ?? "ספק לא זמין",
            amounts,
          }))
          .sort((a, b) => b.amounts.committed - a.amounts.committed);

  return (
    <section dir="rtl" className="mt-6 space-y-3" aria-label="פירוט כספי לקריאה בלבד">
      <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
        <h3 className="font-display text-lg text-foreground">תמונת מצב כספית</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          התחייבות מחושבת ממחירי ההוצאות הקיימים. סכומי תכנון טרם הוגדרו במערכת; הפירוט הוא לצפייה
          בלבד.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <span className="block text-muted-foreground">תכנון</span>
            <strong>טרם הוגדר</strong>
          </div>
          <div>
            <span className="block text-muted-foreground">התחייבות</span>
            <strong>{formatILS(snapshot.event.committed)}</strong>
          </div>
          <div>
            <span className="block text-muted-foreground">שולם</span>
            <strong>{formatMaybeAmount(snapshot.event.paid)}</strong>
          </div>
          <div>
            <span className="block text-muted-foreground">נותר</span>
            <strong>{formatMaybeAmount(snapshot.event.remaining)}</strong>
          </div>
        </div>
        {snapshot.event.overpaid !== null && snapshot.event.overpaid > 0 && (
          <p className="mt-2 text-sm text-destructive">
            שולם ביתר {formatILS(snapshot.event.overpaid)}
          </p>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <BreakdownTable title="לפי קטגוריה" rows={categoryRows} />
        {vendors !== null && (
          <div>
            <BreakdownTable title="לפי ספק" rows={vendorRows} />
            <p className="mt-2 text-xs text-muted-foreground">
              פירוט הספקים כולל רק הוצאות שקושרו לספק; סכום האירוע כולל גם הוצאות ללא ספק.
            </p>
          </div>
        )}
      </div>
      {vendors === null && (
        <p className="text-xs text-muted-foreground">
          פירוט לפי ספק מוצג כאשר קיימת הרשאת צפייה ונתוני הספקים זמינים.
        </p>
      )}
    </section>
  );
}
