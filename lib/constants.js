export const STATUS_OPTIONS = [
  "Not Contacted",
  "Attempted - No Answer",
  "Considering",
  "Onboarded - Trial",
  "Converted - Paying",
  "Declined",
  "Churned",
];

export const STATUS_COLORS = {
  "Not Contacted": "bg-neutral-700 text-neutral-200",
  "Attempted - No Answer": "bg-neutral-600 text-neutral-100",
  "Considering": "bg-amber-600/70 text-amber-50",
  "Onboarded - Trial": "bg-yellow-500/80 text-yellow-950",
  "Converted - Paying": "bg-emerald-600/80 text-emerald-50",
  "Declined": "bg-rose-700/70 text-rose-50",
  "Churned": "bg-rose-900/70 text-rose-100",
};

export const CONTACT_METHODS = ["Phone Call", "WhatsApp", "Email", "In Person"];

const CLOSED_STATUSES = ["Converted - Paying", "Declined", "Churned"];

export function isOpenStatus(status) {
  return !CLOSED_STATUSES.includes(status);
}

// Mirrors the base_price_per_listing tier in supabase/schema.sql's
// agency_overview view (before any per-agency discount_percent is applied).
// zaviri.hr only sells the "Plus" package, minimum 10 listings; below that
// there's no bulk package, so it's full retail.
export function suggestedPricePerListing(activeListings) {
  const n = Number(activeListings) || 0;
  if (n >= 1000) return 7.49;
  if (n >= 500) return 8.49;
  if (n >= 250) return 9.49;
  if (n >= 100) return 10.49;
  if (n >= 50) return 11.99;
  if (n >= 25) return 13.49;
  if (n >= 10) return 14.99;
  return 20;
}

export function isFollowupOverdue(row) {
  if (!row.next_followup_suggested) return false;
  if (!isOpenStatus(row.status)) return false;
  const due = new Date(row.next_followup_suggested);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

// Default sort order for the main table: agencies that need action *now*
// float to the top, cold/untouched ones sink toward the bottom, and closed
// deals (won or lost) sit at the very bottom since there's nothing left to do.
// Lower number = shown first.
const STATUS_PRIORITY = {
  "Onboarded - Trial": 0,
  "Considering": 1,
  "Attempted - No Answer": 2,
  "Not Contacted": 3,
  "Converted - Paying": 4,
  "Declined": 5,
  "Churned": 5,
};

export function priorityRank(row) {
  // An overdue follow-up always wins, regardless of status - it's the
  // "who do I need to call today" signal.
  if (isFollowupOverdue(row)) return -1;
  return STATUS_PRIORITY[row.status] ?? 3;
}

export function compareByPriority(a, b) {
  const rankA = priorityRank(a);
  const rankB = priorityRank(b);
  if (rankA !== rankB) return rankA - rankB;

  // Within the same priority group, whoever has the soonest (or most
  // overdue) upcoming follow-up goes first. Agencies with no follow-up
  // logged yet fall to the end of their group.
  const dueA = a.next_followup_suggested;
  const dueB = b.next_followup_suggested;
  if (dueA && dueB) return new Date(dueA) - new Date(dueB);
  if (dueA && !dueB) return -1;
  if (!dueA && dueB) return 1;
  return 0;
}

export function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("hr-HR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
