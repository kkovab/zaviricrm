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

export function suggestedPricePerListing(activeListings) {
  const n = Number(activeListings) || 0;
  if (n >= 25) return 13;
  if (n >= 10) return 15;
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
