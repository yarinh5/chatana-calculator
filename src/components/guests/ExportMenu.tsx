import { Download, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import type { Guest } from "@/hooks/useGuests";
import type { GuestMember } from "@/hooks/useGuestMembers";
import { labelForGuestAgeGroup, labelForGuestMealPreference } from "@/lib/guest-domain";

export function ExportMenu({
  guests,
  membersByGuest = {},
}: {
  guests: Guest[];
  membersByGuest?: Record<string, GuestMember[]>;
}) {
  const exportExcel = () => {
    if (guests.length === 0) return toast.error("אין אורחים לייצוא");
    const rows = guests.map((g) => ({
      "שם מלא": g.full_name,
      "מספר אנשים": g.group_size,
      צד: g.side ?? "",
      "קטגוריית קבוצה": g.group_category ?? "",
      קרבה: g.relationship ?? "",
      "צריכים הסעה": g.needs_transport ? "כן" : "לא",
      "נקודת איסוף": g.pickup_location ?? "",
      טלפון: g.phone ?? "",
      אימייל: g.email ?? "",
      הגעה: g.arrived === true ? "הגיע" : g.arrived === false ? "לא הגיע" : "טרם",
      "הגיעו בפועל": g.arrived_count ?? "",
      מתנה: Number(g.gift_amount) || 0,
      "אמצעי תשלום": g.payment_method ?? "",
      הערות: g.notes ?? "",
    }));
    const memberRows = guests.flatMap((guest) =>
      (membersByGuest[guest.id] ?? []).map((member) => ({
        "שם קבוצה": guest.full_name,
        "שם משתתף": member.full_name ?? "",
        גיל: labelForGuestAgeGroup(member.age_group),
        מנה: labelForGuestMealPreference(member.meal_preference),
        "הערות תזונה": member.dietary_notes ?? "",
        נגישות: member.accessibility_notes ?? "",
      })),
    );
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "מוזמנים");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(memberRows), "פירוט אישי");
    XLSX.writeFile(wb, "guest-list.xlsx");
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={exportExcel}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm hover:bg-secondary"
      >
        <Download size={16} /> Excel
      </button>
      <button
        onClick={() => window.print()}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm hover:bg-secondary"
      >
        <Printer size={16} /> PDF / הדפסה
      </button>
    </div>
  );
}
