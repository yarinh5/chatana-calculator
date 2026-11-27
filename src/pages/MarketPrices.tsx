import { AppTopBar } from "@/components/AppTopBar";
import { MarketCatalogPreview } from "@/components/wedding/MarketCatalogPreview";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { useWorkspace } from "@/hooks/useWorkspace";

export default function MarketPrices() {
  const workspace = useWorkspace();
  const subscription = useSubscription(workspace.activeEventId, { includeExpenseCount: false });
  const canView = !!workspace.activeWorkspace && workspace.can("budget_view");

  let state: { title: string; retry?: () => void } | null = null;
  if (workspace.loading) state = { title: "טוען סביבת עבודה" };
  else if (workspace.error)
    state = { title: "שגיאה בטעינת סביבת העבודה", retry: () => void workspace.refresh() };
  else if (!workspace.activeWorkspace) state = { title: "אין סביבת עבודה להצגה" };
  else if (!canView) state = { title: "אין לך הרשאה לצפייה בתקציב של האירוע הזה" };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <AppTopBar subscription={subscription} />
      <main className="mx-auto max-w-6xl px-3 py-5 sm:px-4 md:px-6">
        {state ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p>{state.title}</p>
            {state.retry && (
              <Button variant="outline" className="mt-4" onClick={state.retry}>
                נסה שוב
              </Button>
            )}
          </div>
        ) : (
          <MarketCatalogPreview
            key={workspace.activeEventId}
            eventName={workspace.activeWorkspace!.event_name}
          />
        )}
      </main>
    </div>
  );
}
