import { createFileRoute } from "@tanstack/react-router";
import { WeddingCalculator } from "@/components/wedding/WeddingCalculator";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "מחשבון תקציב חתונה — Wedding Budget IL" },
      {
        name: "description",
        content:
          "מחשבון הוצאות חתונה מלא לישראל: עלות לאורח, רווח מהמעטפות, ומחירי שוק מעודכנים ל-2025.",
      },
      { property: "og:title", content: "מחשבון תקציב חתונה" },
      {
        property: "og:description",
        content: "כי כל שקל חשוב — וכי אתם ראויים לחתונת החלומות.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <WeddingCalculator />;
}
