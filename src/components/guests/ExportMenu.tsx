import { Download, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import type { Guest } from "@/hooks/useGuests";

export function ExportMenu({ guests }: { guests: Guest[] }) {
  const exportExcel = () => {
    if (guests.length === 0) return toast.error("אין אורחים לייצוא");
    const rows = guests.map((g) => ({
      "שם מלא": g.full_name,
      "מספר אנשים": g.group_size,
      צד: g.side ?? "",
      טלפון: g.phone ?? "",
      אימייל: g.email ?? "",
      הגעה: g.arrived === true ? "הגיע" : g.arrived === false ? "לא הגיע" : "טרם",
      "הגיעו בפועל": g.arrived_count ?? "",
      מתנה: Number(g.gift_amount) || 0,
      "אמצעי תשלום": g.payment_method ?? "",
      הערות: g.notes ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "מוזמנים");
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
