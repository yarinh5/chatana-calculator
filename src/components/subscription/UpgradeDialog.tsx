import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Lock, X } from "lucide-react";
import { PRICE_LABELS, UPGRADE_COPY, type UpgradeReason } from "@/lib/subscription";

type Props = {
  open: boolean;
  reason: UpgradeReason;
  onClose: () => void;
};

export function UpgradeDialog({ open, reason, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const copy = UPGRADE_COPY[reason] ?? UPGRADE_COPY.generic;
  const isExtension = reason === "premium_expired";

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-dialog-title"
      className="no-print fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-card p-5 shadow-2xl ring-1 ring-border sm:rounded-3xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold ring-1 ring-gold/40">
              <Lock size={19} />
            </span>
            <div>
              <h2 id="upgrade-dialog-title" className="font-display text-xl text-foreground">
                {copy.title}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.body}</p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="סגור"
            className="rounded-full p-2 text-muted-foreground hover:bg-secondary"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 rounded-2xl bg-secondary/50 p-4 ring-1 ring-border">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-foreground">
              {isExtension ? "הארכת Premium" : "Premium"}
            </span>
            <span className="font-display text-2xl text-foreground">
              {isExtension ? PRICE_LABELS.extension : PRICE_LABELS.premium}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isExtension ? PRICE_LABELS.extensionSubtitle : PRICE_LABELS.premiumSubtitle}
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link
            to="/pricing"
            onClick={onClose}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-rose px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
          >
            צפייה במסלולים
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold hover:bg-secondary"
          >
            לא עכשיו
          </button>
        </div>
        <p className="mt-3 text-center text-[11px] leading-5 text-muted-foreground">
          אין עדיין סליקה אוטומטית במערכת. להפעלת Premium פנו למנהל.
        </p>
      </div>
    </div>
  );
}
