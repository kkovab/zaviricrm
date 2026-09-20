const LEGACY_META_PREFIX = "zaviri-ticket-v2:";

// The deployed database may briefly lag behind the app migration. During that
// window, keep the richer ticket data in the old `type` text column so ticket
// creation/editing still works. As soon as tags/details columns exist, the API
// writes to them normally and this codec becomes a no-op compatibility layer.
export function encodeLegacyTicketMeta({ tags = [], details = "", type = null }) {
  return `${LEGACY_META_PREFIX}${encodeURIComponent(
    JSON.stringify({ tags, details: details || null, type: type || null })
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
  const tags = Array.isArray(ticket.tags)
    ? ticket.tags
    : legacy?.tags || (ticket.type && !legacy ? [ticket.type] : []);

  return {
    ...ticket,
    type: legacy?.type ?? ticket.type ?? null,
    tags,
    details: ticket.details ?? legacy?.details ?? null,
    agency_name: ticket.agencies?.name || ticket.agency_name || "",
    agency: ticket.agencies || ticket.agency || null,
    agencies: undefined,
  };
}

export function isMissingRichTicketColumns(error) {
  const message = `${error?.message || ""} ${error?.details || ""}`;
  return /(tags|details)/i.test(message) && /(column|schema cache)/i.test(message);
}
