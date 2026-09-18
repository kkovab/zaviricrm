export const CONTACT_METHODS = ["Phone Call", "WhatsApp", "Email", "In Person"];

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
