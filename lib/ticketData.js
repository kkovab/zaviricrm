const LEGACY_META_PREFIX = "zaviri-ticket-v2:";
const PRIORITY_META_PREFIX = "__zaviri_priority:";
const EMAIL_META_PREFIX = "__zaviri_email:";

export const TICKET_PRIORITIES = ["low", "medium", "urgent"];
export const TICKET_ACTIONS = [
  "Intro with Zaviri.hr link",
  "Send pricing",
  "Request XML",
  "Pull listings",
  "Free promo",
];

export function normalizeTicketPriority(value) {
  return TICKET_PRIORITIES.includes(value) ? value : "medium";
}

export function normalizeTicketEmail(value) {
  const email = typeof value === "string" ? value.trim() : "";
  return email || null;
}

export function withTicketPriority(tags = [], priority = "medium", email = null) {
  const visibleTags = tags.filter((tag) =>
    typeof tag === "string" && !tag.startsWith(PRIORITY_META_PREFIX) && !tag.startsWith(EMAIL_META_PREFIX)
  );
  const normalizedEmail = normalizeTicketEmail(email);
  return [
    ...visibleTags,
    `${PRIORITY_META_PREFIX}${normalizeTicketPriority(priority)}`,
    ...(normalizedEmail ? [`${EMAIL_META_PREFIX}${encodeURIComponent(normalizedEmail)}`] : []),
  ];
}

// The deployed database may briefly lag behind the app migration. During that
// window, keep the richer ticket data in the old `type` text column so ticket
// creation/editing still works. As soon as tags/details columns exist, the API
// writes to them normally and this codec becomes a no-op compatibility layer.
export function encodeLegacyTicketMeta({ tags = [], details = "", type = null, priority = "medium", email = null }) {
  return `${LEGACY_META_PREFIX}${encodeURIComponent(
    JSON.stringify({ tags, details: details || null, type: type || null, priority: normalizeTicketPriority(priority), email: normalizeTicketEmail(email) })
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

function decodeTicketEmailTag(value) {
  if (!value?.startsWith?.(EMAIL_META_PREFIX)) return null;
  try {
    return normalizeTicketEmail(decodeURIComponent(value.slice(EMAIL_META_PREFIX.length)));
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
  const storedEmail = rawTags.find((tag) => typeof tag === "string" && tag.startsWith(EMAIL_META_PREFIX));
  const tags = rawTags.filter((tag) =>
    typeof tag === "string" && !tag.startsWith(PRIORITY_META_PREFIX) && !tag.startsWith(EMAIL_META_PREFIX)
  );

  return {
    ...ticket,
    type: legacy?.type ?? ticket.type ?? null,
    tags,
    details: ticket.details ?? legacy?.details ?? null,
    priority: normalizeTicketPriority(storedPriority?.slice(PRIORITY_META_PREFIX.length) || legacy?.priority),
    email: storedEmail ? decodeTicketEmailTag(storedEmail) : normalizeTicketEmail(legacy?.email),
    agency_name: ticket.agencies?.name || ticket.agency_name || "",
    agency: ticket.agencies || ticket.agency || null,
    agencies: undefined,
  };
}

export function isMissingRichTicketColumns(error) {
  const message = `${error?.message || ""} ${error?.details || ""}`;
  return /(tags|details)/i.test(message) && /(column|schema cache)/i.test(message);
}
