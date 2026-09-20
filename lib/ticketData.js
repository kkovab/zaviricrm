const LEGACY_META_PREFIX = "zaviri-ticket-v2:";
const PRIORITY_META_PREFIX = "__zaviri_priority:";

export const TICKET_PRIORITIES = ["low", "medium", "urgent"];
export const TICKET_ACTIONS = [
  "Send pricing",
  "Send intro email",
  "Send onboarding",
  "Send XML guide",
  "Send listing link",
  "Call agency",
  "Review website",
  "Update account",
];

export function normalizeTicketPriority(value) {
  return TICKET_PRIORITIES.includes(value) ? value : "medium";
}

export function withTicketPriority(tags = [], priority = "medium") {
  const visibleTags = tags.filter((tag) => typeof tag === "string" && !tag.startsWith(PRIORITY_META_PREFIX));
  return [...visibleTags, `${PRIORITY_META_PREFIX}${normalizeTicketPriority(priority)}`];
}

// The deployed database may briefly lag behind the app migration. During that
// window, keep the richer ticket data in the old `type` text column so ticket
// creation/editing still works. As soon as tags/details columns exist, the API
// writes to them normally and this codec becomes a no-op compatibility layer.
export function encodeLegacyTicketMeta({ tags = [], details = "", type = null, priority = "medium" }) {
  return `${LEGACY_META_PREFIX}${encodeURIComponent(
    JSON.stringify({ tags, details: details || null, type: type || null, priority: normalizeTicketPriority(priority) })
  )}`;
}

export function decodeLegacyTicketMeta(value) {
  if (!value?.startsWith?.(LEGACY_META_PREFIX)) return null;
  try {
    return JSON.parse(decodeURIComponent(value.slice(LEGACY_META_PREFIX.length)));
  } catch {
    return null;
  }
}

export function normalizeTicket(ticket) {
  const legacy = decodeLegacyTicketMeta(ticket.type);
  const rawTags = Array.isArray(ticket.tags)
    ? ticket.tags
    : legacy?.tags || (ticket.type && !legacy ? [ticket.type] : []);
  const storedPriority = rawTags.find((tag) => typeof tag === "string" && tag.startsWith(PRIORITY_META_PREFIX));
  const tags = rawTags.filter((tag) => typeof tag === "string" && !tag.startsWith(PRIORITY_META_PREFIX));

  return {
    ...ticket,
    type: legacy?.type ?? ticket.type ?? null,
    tags,
    details: ticket.details ?? legacy?.details ?? null,
    priority: normalizeTicketPriority(storedPriority?.slice(PRIORITY_META_PREFIX.length) || legacy?.priority),
    agency_name: ticket.agencies?.name || ticket.agency_name || "",
    agency: ticket.agencies || ticket.agency || null,
    agencies: undefined,
  };
}

export function isMissingRichTicketColumns(error) {
  const message = `${error?.message || ""} ${error?.details || ""}`;
  return /(tags|details)/i.test(message) && /(column|schema cache)/i.test(message);
}
