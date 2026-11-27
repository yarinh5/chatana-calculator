import { Download, Printer } from "lucide-react";
import { useRef, useState } from "react";
import writeExcelFile from "write-excel-file/browser";
import { toast } from "sonner";
import type { Guest } from "@/hooks/useGuests";
import type { GuestMember } from "@/hooks/useGuestMembers";
import { labelForGuestAgeGroup, labelForGuestMealPreference } from "@/lib/guest-domain";
import { toExcelSheetData } from "@/lib/excel-files";

export function ExportMenu({
  guests,
  membersByGuest = {},
  canViewGifts = true,
  canViewAttendance = true,
}: {
  guests: Guest[];
  membersByGuest?: Record<string, GuestMember[]>;
  canViewGifts?: boolean;
  canViewAttendance?: boolean;
}) {
  const [exporting, setExporting] = useState(false);
  const exportInFlight = useRef(false);
  const exportExcel = async () => {
    if (guests.length === 0) return toast.error("אין אורחים לייצוא");
    if (exportInFlight.current) return;
    exportInFlight.current = true;
    setExporting(true);
    try {
      const rows = guests.map((g) => {
        const base: Record<string, string | number> = {
          "שם מלא": g.full_name,
          "מספר אנשים": g.group_size,
          צד: g.side ?? "",
          "קטגוריית קבוצה": g.group_category ?? "",
          קרבה: g.relationship ?? "",
          "צריכים הסעה": g.needs_transport ? "כן" : "לא",
          "נקודת איסוף": g.pickup_location ?? "",
          טלפון: g.phone ?? "",
          אימייל: g.email ?? "",
          הערות: g.notes ?? "",
        };
        if (canViewAttendance) {
          base["הגעה"] = g.arrived === true ? "הגיע" : g.arrived === false ? "לא הגיע" : "טרם";
          base["הגיעו בפועל"] = g.arrived_count ?? "";
        }
        if (canViewGifts) {
          base["מתנה"] = Number(g.gift_amount) || 0;
          base["אמצעי תשלום"] = g.payment_method ?? "";
        }
        return base;
      });
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
      await writeExcelFile([
        { sheet: "מוזמנים", data: toExcelSheetData(Object.keys(rows[0]), rows) },
        {
          sheet: "פירוט אישי",
          data: toExcelSheetData(
            ["שם קבוצה", "שם משתתף", "גיל", "מנה", "הערות תזונה", "נגישות"],
            memberRows,
          ),
        },
      ]).toFile("guest-list.xlsx");
    } catch {
      toast.error("ייצוא קובץ Excel נכשל. נסו שוב.");
    } finally {
      exportInFlight.current = false;
      setExporting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => {
          void exportExcel();
        }}
        disabled={exporting}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm hover:bg-secondary"
      >
        <Download size={16} /> {exporting ? "מכינים Excel..." : "Excel"}
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
