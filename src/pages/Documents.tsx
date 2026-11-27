import { AppTopBar } from "@/components/AppTopBar";
import { DocumentPrototype } from "@/components/documents/DocumentPrototype";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { useWorkspace } from "@/hooks/useWorkspace";

export default function Documents() {
  const workspace = useWorkspace();
  const eventId = workspace.activeEventId;
  const subscription = useSubscription(eventId, { includeExpenseCount: false });
  const canView = !!workspace.activeWorkspace && workspace.can("documents_view");
  const canEdit = canView && workspace.can("documents_edit") && subscription.canEdit;

  let state: { title: string; retry?: () => void } | null = null;
  if (workspace.loading || subscription.loading) state = { title: "טוען סביבת עבודה" };
  else if (workspace.error)
    state = { title: "שגיאה בטעינת סביבת העבודה", retry: () => void workspace.refresh() };
  else if (!workspace.activeWorkspace) state = { title: "אין סביבת עבודה להצגה" };
  else if (!canView) state = { title: "אין לך הרשאה לצפייה במסמכים באירוע הזה" };
  else if (subscription.error)
    state = { title: "שגיאה בטעינת מצב המנוי", retry: () => void subscription.refresh() };

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
          <DocumentPrototype
            key={eventId}
            eventName={workspace.activeWorkspace!.event_name}
            canEdit={canEdit}
          />
        )}
      </main>
    </div>
  );
}
