export const CONTACT_METHODS = ["Phone Call", "WhatsApp", "Email", "In Person"];

// The smallest package that covers an agency's active listings determines
// its average price per listing. Keep this in sync with supabase/schema.sql.
export const PRICING_PACKAGES = [
  { capacity: 50, monthlyPrice: 599.5, pricePerListing: 11.99 },
  { capacity: 100, monthlyPrice: 1049, pricePerListing: 10.49 },
  { capacity: 150, monthlyPrice: 1499, pricePerListing: 9.99 },
  { capacity: 300, monthlyPrice: 2847, pricePerListing: 9.49 },
  { capacity: 500, monthlyPrice: 4495, pricePerListing: 8.99 },
  { capacity: 1000, monthlyPrice: 8490, pricePerListing: 8.49 },
  { capacity: 2000, monthlyPrice: 15980, pricePerListing: 7.99 },
];

export function packagePricing(activeListings) {
  const listingCount = Math.max(0, Number(activeListings) || 0);
  if (listingCount === 0) return null;

  const pricingPackage =
    PRICING_PACKAGES.find(({ capacity }) => listingCount <= capacity) ||
    PRICING_PACKAGES[PRICING_PACKAGES.length - 1];
  return {
    package_capacity: pricingPackage.capacity,
    package_monthly_price: pricingPackage.monthlyPrice,
    price_per_listing: pricingPackage.pricePerListing,
    est_monthly_value: Number((listingCount * pricingPackage.pricePerListing).toFixed(2)),
  };
}

export function withPackagePricing(agency) {
  const pricing = packagePricing(agency.active_listings);
  return pricing
    ? { ...agency, ...pricing }
    : {
        ...agency,
        package_capacity: null,
        package_monthly_price: null,
        price_per_listing: null,
        est_monthly_value: 0,
      };
}

export function withAgencyCalculations(agency) {
  const pricedAgency = withPackagePricing(agency);
  if (!agency.trial_start_date) {
    return { ...pricedAgency, trial_end_date: null, days_left_in_trial: null };
  }

  const [year, month, day] = String(agency.trial_start_date).slice(0, 10).split("-").map(Number);
  const trialEnd = new Date(year, month - 1, day);
  trialEnd.setDate(trialEnd.getDate() + 30);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((trialEnd.getTime() - today.getTime()) / 86_400_000);
  const trialEndDate = [
    trialEnd.getFullYear(),
    String(trialEnd.getMonth() + 1).padStart(2, "0"),
    String(trialEnd.getDate()).padStart(2, "0"),
  ].join("-");

  return { ...pricedAgency, trial_end_date: trialEndDate, days_left_in_trial: daysLeft };
}

export function formatEuro(value) {
  return Number(value || 0).toLocaleString("sr-RS", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// next_followup_date currently stores a date for most agencies. Keep those
// labels calendar-based (so tomorrow is always "1d", not "12h" at noon),
// while still supporting an hour-level label if a timestamp is supplied.
export function followupRelativeLabel(value, now = new Date()) {
  if (!value) return null;

  const rawValue = String(value);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(rawValue);
  let due;

  if (dateOnly) {
    const [year, month, day] = rawValue.split("-").map(Number);
    due = new Date(year, month - 1, day);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);

    if (days < 0) return { label: `Overdue ${Math.abs(days)}d`, tone: "overdue" };
    if (days === 0) return { label: "Today", tone: "today" };
    return { label: `${days}d`, tone: "upcoming" };
  }

  due = new Date(rawValue);
  if (Number.isNaN(due.getTime())) return null;
  const milliseconds = due.getTime() - now.getTime();
  const absoluteMilliseconds = Math.abs(milliseconds);
  const prefix = milliseconds < 0 ? "Overdue " : "";

  if (absoluteMilliseconds < 3_600_000) {
    return { label: `${prefix}${Math.max(1, Math.ceil(absoluteMilliseconds / 60_000))}m`, tone: milliseconds < 0 ? "overdue" : "today" };
  }
  if (absoluteMilliseconds < 86_400_000) {
    return { label: `${prefix}${Math.ceil(absoluteMilliseconds / 3_600_000)}h`, tone: milliseconds < 0 ? "overdue" : "today" };
  }
  return { label: `${prefix}${Math.ceil(absoluteMilliseconds / 86_400_000)}d`, tone: milliseconds < 0 ? "overdue" : "upcoming" };
}

// A follow-up is overdue if you set a next_followup_date yourself and it's
// in the past. Statuses marked "closed" in Manage Statuses (won or lost
// deals) never count as overdue - there's nothing left to follow up on.
export function isFollowupOverdue(row) {
  if (!row.next_followup_date) return false;
  if (row.status_is_closed) return false;
  const due = new Date(row.next_followup_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

// Whether this agency has ANY follow-up scheduled right now - whether it's
// already overdue or still upcoming. Used by the "Due follow-ups only"
// filter: next_followup_date is set through the Follow-ups drawer's "Set
// next follow-up" tab now, so this should surface everything you've
// actually scheduled, not just the ones that have already slipped past.
export function hasScheduledFollowup(row) {
  if (!row.next_followup_date) return false;
  if (row.status_is_closed) return false;
  return true;
}

// Keeps the Follow Up work queue focused on overdue items and the near-term
// schedule, while still allowing a far-future follow-up to remain stored on
// its agency row.
export function isFollowupWithinNextDays(row, days = 30) {
  // A deliberately scheduled follow-up stays in the work queue even when
  // the agency currently has a closed status (for example Declined). The
  // date is the explicit signal that the user still wants to contact them.
  if (!row.next_followup_date) return false;
  const due = new Date(row.next_followup_date);
  if (Number.isNaN(due.getTime())) return false;
  due.setHours(0, 0, 0, 0);
  const limit = new Date();
  limit.setHours(0, 0, 0, 0);
  limit.setDate(limit.getDate() + days);
  return due <= limit;
}

// Whether this agency's scheduled follow-up is due specifically today (not
// overdue from an earlier date, not still upcoming) - drives the small
// notification badge on the "Has a follow-up scheduled" button.
export function isFollowupToday(row) {
  if (!row.next_followup_date) return false;
  if (row.status_is_closed) return false;
  const today = new Date().toISOString().slice(0, 10);
  return String(row.next_followup_date).slice(0, 10) === today;
}

// Default sort order for the main table: agencies that need action *now*
// float to the top, cold/untouched ones sink toward the bottom (in whatever
// order you've set up in Manage Statuses), and closed deals (won or lost)
// sit at the very bottom since there's nothing left to do. Lower number =
// shown first. Fully driven by the statuses table now, so adding, renaming,
// recoloring or reordering a status just works without touching this code.
export function priorityRank(row) {
  // An overdue follow-up always wins, regardless of status - it's the
  // "who do I need to call today" signal.
  if (isFollowupOverdue(row)) return -1;
  if (row.status_is_closed) return 1000 + (row.status_sort_order ?? 0);
  return row.status_sort_order ?? 0;
}

export function compareByPriority(a, b) {
  const rankA = priorityRank(a);
  const rankB = priorityRank(b);
  if (rankA !== rankB) return rankA - rankB;

  // Within the same priority group, whoever has the soonest (or most
  // overdue) upcoming follow-up goes first. Agencies with no follow-up date
  // set fall to the end of their group.
  const dueA = a.next_followup_date;
  const dueB = b.next_followup_date;
  if (dueA && dueB) return new Date(dueA) - new Date(dueB);
  if (dueA && !dueB) return -1;
  if (!dueA && dueB) return 1;
  return 0;
}

// Picks black or white text so it stays readable against any custom status
// color someone might choose in Manage Statuses.
export function contrastTextColor(hex) {
  if (!hex || typeof hex !== "string") return "#ffffff";
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "#ffffff";
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111111" : "#ffffff";
}

// A ticket is overdue if it has a due date, isn't marked done, and that
// date has passed. Tickets with no due date are never "overdue" - they're
// just open, whenever.
export function isTicketOverdue(ticket) {
  if (!ticket || ticket.done || !ticket.due_date) return false;
  const due = new Date(ticket.due_date);
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
