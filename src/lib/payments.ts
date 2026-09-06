export const PAYMENT_TYPES = ["מקדמה", "יתרה", "תשלום אחר"] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const PAYMENT_METHODS = ["מזומן", "העברה בנקאית", "צ'ק", "אשראי", "ביט", "אחר"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type Payment = {
  id: string;
  expenseId: string;
  amount: number;
  paymentDate: string; // YYYY-MM-DD
  paymentType: string;
  paymentMethod: string;
  note: string | null;
};

export type DepositInfo = {
  requiresDeposit: boolean;
  depositPercent: number;
  depositDate: string | null;
  balanceDate: string | null;
};

export type PaymentStatus = "לא שולם" | "שולם חלקית" | "שולמה מקדמה" | "שולם במלואו" | "באיחור";

export type ExpenseFinance = {
  price: number;
  totalPaid: number;
  remaining: number;
  overpaid: number;
  percentPaid: number;
  depositAmount: number;
  balanceAmount: number;
  depositPaid: number;
  balancePaid: number;
  depositStatus: PaymentStatus;
  balanceStatus: PaymentStatus;
  status: PaymentStatus;
  overdueAmount: number;
  overdueDays: number;
  nextDueDate: string | null;
  nextDueAmount: number;
};

export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function daysBetween(fromISO: string, toISO: string) {
  const a = new Date(`${fromISO}T00:00:00`).getTime();
  const b = new Date(`${toISO}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

export function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function statusTone(status: PaymentStatus) {
  switch (status) {
    case "שולם במלואו":
      return "bg-success/15 text-success ring-success/30";
    case "שולמה מקדמה":
      return "bg-gold/15 text-gold ring-gold/40";
    case "שולם חלקית":
      return "bg-gold/10 text-gold ring-gold/30";
    case "באיחור":
      return "bg-destructive/15 text-destructive ring-destructive/30";
    default:
      return "bg-muted text-muted-foreground ring-border";
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeFinance(
  price: number,
  payments: Payment[],
  deposit: DepositInfo,
  today: string = todayISO(),
): ExpenseFinance {
  const total = Math.max(0, Number(price) || 0);
  const totalPaid = round2(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const remaining = round2(Math.max(0, total - totalPaid));
  const overpaid = round2(Math.max(0, totalPaid - total));
  const percentPaid = total > 0 ? Math.min(100, Math.round((totalPaid / total) * 100)) : totalPaid > 0 ? 100 : 0;

  const depositAmount = deposit.requiresDeposit
    ? round2((total * (Number(deposit.depositPercent) || 0)) / 100)
    : 0;
  const balanceAmount = round2(Math.max(0, total - depositAmount));

  const sumOf = (type: string) =>
    round2(payments.filter((p) => p.paymentType === type).reduce((s, p) => s + (Number(p.amount) || 0), 0));

  const depositPaid = deposit.requiresDeposit ? sumOf("מקדמה") : 0;
  const balancePaid = round2(totalPaid - depositPaid);

  const partStatus = (due: number, paid: number): PaymentStatus => {
    if (due <= 0) return "לא שולם";
    if (paid >= due - 0.01) return "שולם במלואו";
    if (paid > 0) return "שולם חלקית";
    return "לא שולם";
  };

  const depositStatus = partStatus(depositAmount, depositPaid);
  const balanceStatus = partStatus(balanceAmount, balancePaid);

  // Next due payment
  let nextDueDate: string | null = null;
  let nextDueAmount = 0;
  if (deposit.requiresDeposit && depositStatus !== "שולם במלואו" && deposit.depositDate) {
    nextDueDate = deposit.depositDate;
    nextDueAmount = round2(Math.max(0, depositAmount - depositPaid));
  } else if (balanceStatus !== "שולם במלואו" && deposit.balanceDate) {
    nextDueDate = deposit.balanceDate;
    nextDueAmount = round2(Math.max(0, balanceAmount - balancePaid));
  }

  let overdueAmount = 0;
  let overdueDays = 0;
  const checkOverdue = (date: string | null, due: number, paid: number) => {
    if (!date || due <= 0) return;
    const missing = round2(Math.max(0, due - paid));
    if (missing <= 0) return;
    const late = daysBetween(date, today);
    if (late > 0) {
      overdueAmount = round2(overdueAmount + missing);
      overdueDays = Math.max(overdueDays, late);
    }
  };
  checkOverdue(deposit.depositDate, depositAmount, depositPaid);
  checkOverdue(deposit.balanceDate, balanceAmount, balancePaid);

  let status: PaymentStatus;
  if (total > 0 && totalPaid >= total - 0.01) status = "שולם במלואו";
  else if (overdueAmount > 0) status = "באיחור";
  else if (deposit.requiresDeposit && depositStatus === "שולם במלואו") status = "שולמה מקדמה";
  else if (totalPaid > 0) status = "שולם חלקית";
  else status = "לא שולם";

  return {
    price: total,
    totalPaid,
    remaining,
    overpaid,
    percentPaid,
    depositAmount,
    balanceAmount,
    depositPaid,
    balancePaid,
    depositStatus,
    balanceStatus,
    status,
    overdueAmount,
    overdueDays,
    nextDueDate,
    nextDueAmount,
  };
}
