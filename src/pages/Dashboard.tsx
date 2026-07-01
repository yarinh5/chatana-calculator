import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { WeddingCalculator } from "@/components/wedding/WeddingCalculator";
import { AppTopBar } from "@/components/AppTopBar";

export default function Dashboard() {
  const { session, profile } = useAuth();
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user) return;
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("id")
        .eq("owner_id", session.user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data) setEventId(data.id);
    })();
  }, [session?.user]);

  if (!eventId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-rose" />
      </div>
    );
  }

  return (
    <WeddingCalculator
      eventId={eventId}
      topBar={<AppTopBar />}
      subtitle={profile?.full_name ? `שלום ${profile.full_name} — בואו נתכנן 💕` : undefined}
    />
  );
}
