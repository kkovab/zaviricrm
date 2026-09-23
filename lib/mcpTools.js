import { supabaseServer } from "@/lib/supabaseServer";
import {
  encodeLegacyTicketMeta,
  isMissingRichTicketColumns,
  normalizeTicket,
  normalizeTicketPriority,
  TICKET_ACTIONS,
  TICKET_PRIORITIES,
  withTicketPriority,
} from "@/lib/ticketData";
import { CONTACT_METHODS } from "@/lib/constants";

const AGENCY_OVERVIEW_FIELDS = [
  "id",
  "name",
  "contact_person",
  "phone",
  "mobile_alt",
  "phone_numbers",
  "email",
  "location",
  "active_listings",
  "qualified",
  "oglasnik_profil",
  "website",
  "needs_followup",
  "status_id",
  "status",
  "status_color",
  "status_is_closed",
  "date_first_contacted",
  "trial_start_date",
  "next_followup_date",
  "next_followup_note",
  "discount_offered",
  "discount_percent",
  "what_they_know",
  "what_they_still_need",
  "notes",
  "package_capacity",
  "package_monthly_price",
  "price_per_listing",
  "est_monthly_value",
  "trial_end_date",
  "days_left_in_trial",
  "last_followup_date",
  "followup_count",
  "note_count",
  "latest_note",
  "created_at",
  "updated_at",
].join(", ");

const TICKET_SELECT =
  "*, agencies(name, contact_person, email, phone, mobile_alt, phone_numbers, website, oglasnik_profil, location)";
const CONTACT_FIELDS = ["contact_person", "email", "website", "oglasnik_profil"];
const DETAIL_FIELDS = [
  "name",
  "location",
  "active_listings",
  "qualified",
  "needs_followup",
  "date_first_contacted",
  "trial_start_date",
  "discount_offered",
  "discount_percent",
  "what_they_know",
  "what_they_still_need",
];

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

function objectSchema(properties, required = []) {
  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  };
}

const agencyIdProperty = { type: "string", description: "Agency UUID." };
const limitProperty = { type: "integer", minimum: 1, maximum: 200, description: "Maximum results (default 50, max 200)." };
const dateProperty = { type: "string", description: "Calendar date in YYYY-MM-DD format." };
const statusProperties = {
  status_id: { type: "string", description: "Existing status UUID. Do not also pass status_name." },
  status_name: { type: "string", description: "Exact existing status name. Do not also pass status_id." },
};

export const MCP_TOOLS = [
  {
    name: "list_agencies",
    description:
      "List CRM agencies with contact data, pipeline status, follow-up summary, note counts, trial data, and current calculated pricing. Can return the queue missing every phone number.",
    inputSchema: objectSchema({
      missing_contact_only: { type: "boolean", description: "Only agencies with no value in phone_numbers or legacy phone fields." },
      search: { type: "string", description: "Partial case-insensitive agency-name search." },
      status_name: { type: "string", description: "Exact status-name filter." },
      needs_followup: { type: "boolean", description: "Filter by the manual follow-up flag." },
      scheduled_only: { type: "boolean", description: "Only agencies with at least one scheduled follow-up." },
      limit: limitProperty,
    }),
  },
  {
    name: "get_agency",
    description:
      "Get an agency by UUID or partial name, including current pricing/status plus recent notes, completed contact history, scheduled follow-ups, and tickets.",
    inputSchema: objectSchema({
      id: agencyIdProperty,
      name: { type: "string", description: "Agency name or partial name." },
    }),
  },
  {
    name: "update_agency_contact",
    description:
      "Update an agency's contact person, canonical phone_numbers list, email, website, or listing profile. Legacy phone fields are kept synchronized automatically. An optional note is added to agency_notes, never the legacy notes field.",
    inputSchema: objectSchema(
      {
        id: agencyIdProperty,
        contact_person: { type: ["string", "null"] },
        phone_numbers: { type: "array", items: { type: "string" }, maxItems: 20, description: "Full replacement phone-number list." },
        phone: { type: ["string", "null"], description: "Backward-compatible primary phone input. Prefer phone_numbers." },
        mobile_alt: { type: ["string", "null"], description: "Backward-compatible alternate phone input. Prefer phone_numbers." },
        email: { type: ["string", "null"] },
        website: { type: ["string", "null"] },
        oglasnik_profil: { type: ["string", "null"] },
        note: { type: "string", description: "Optional contact-source/context note stored in timestamped note history." },
      },
      ["id"]
    ),
  },
  {
    name: "update_agency",
    description:
      "Update safe CRM/business fields on an agency, including its existing pipeline status. Does not edit contacts, legacy notes, status definitions, or delete anything.",
    inputSchema: objectSchema(
      {
        id: agencyIdProperty,
        name: { type: "string" },
        location: { type: ["string", "null"] },
        active_listings: { type: "integer", minimum: 0 },
        qualified: { type: "boolean" },
        needs_followup: { type: "boolean" },
        date_first_contacted: { ...dateProperty, type: ["string", "null"] },
        trial_start_date: { ...dateProperty, type: ["string", "null"] },
        discount_offered: { type: ["string", "null"] },
        discount_percent: { type: "number", minimum: 0 },
        what_they_know: { type: ["string", "null"] },
        what_they_still_need: { type: ["string", "null"] },
        ...statusProperties,
      },
      ["id"]
    ),
  },
  {
    name: "list_statuses",
    description: "List valid CRM pipeline statuses, their colors, open/closed state, and order.",
    inputSchema: objectSchema({}),
  },
  {
    name: "list_agency_notes",
    description: "List timestamped notes for one agency, newest first.",
    inputSchema: objectSchema({ agency_id: agencyIdProperty, limit: limitProperty }, ["agency_id"]),
  },
  {
    name: "add_agency_note",
    description: "Add a timestamped note to an agency's note history.",
    inputSchema: objectSchema(
      { agency_id: agencyIdProperty, content: { type: "string", description: "Non-empty note text." } },
      ["agency_id", "content"]
    ),
  },
  {
    name: "list_contact_history",
    description: "List completed/logged agency contacts, newest contact date first.",
    inputSchema: objectSchema({ agency_id: agencyIdProperty, limit: limitProperty }),
  },
  {
    name: "log_contact",
    description:
      "Log a completed contact in history. Optionally move the agency to an existing status in the same operation.",
    inputSchema: objectSchema(
      {
        agency_id: agencyIdProperty,
        date: dateProperty,
        method: { type: "string", enum: CONTACT_METHODS },
        discussed: { type: ["string", "null"] },
        outcome: { type: ["string", "null"], description: "Legacy free-text outcome, if useful." },
        next_step: { type: ["string", "null"] },
        ...statusProperties,
      },
      ["agency_id"]
    ),
  },
  {
    name: "list_scheduled_followups",
    description: "List future or overdue scheduled contacts, optionally filtered by agency or date range.",
    inputSchema: objectSchema({
      agency_id: agencyIdProperty,
      from_date: dateProperty,
      through_date: dateProperty,
      limit: limitProperty,
    }),
  },
  {
    name: "schedule_followup",
    description: "Schedule another contact for an agency with an optional reason. Multiple dates per agency are supported.",
    inputSchema: objectSchema(
      { agency_id: agencyIdProperty, date: dateProperty, reason: { type: ["string", "null"] } },
      ["agency_id", "date"]
    ),
  },
  {
    name: "complete_scheduled_followup",
    description:
      "Complete a scheduled follow-up: log it in contact history, optionally update the agency status, then remove that scheduled item from the active queue.",
    inputSchema: objectSchema(
      {
        scheduled_followup_id: { type: "string", description: "Scheduled follow-up UUID." },
        date: dateProperty,
        method: { type: "string", enum: CONTACT_METHODS },
        discussed: { type: ["string", "null"] },
        outcome: { type: ["string", "null"] },
        next_step: { type: ["string", "null"] },
        ...statusProperties,
      },
      ["scheduled_followup_id"]
    ),
  },
  {
    name: "list_tickets",
    description: "List agency action tickets with tags, priority, ticket email, deadline, completion state, and agency contact data.",
    inputSchema: objectSchema({
      agency_id: agencyIdProperty,
      state: { type: "string", enum: ["open", "done", "all"], description: "Default open." },
      priority: { type: "string", enum: TICKET_PRIORITIES },
      limit: limitProperty,
    }),
  },
  {
    name: "create_ticket",
    description: "Create a CRM action ticket for an agency. Ticket email is independent from the agency's main email.",
    inputSchema: objectSchema(
      {
        agency_id: agencyIdProperty,
        title: { type: "string" },
        type: { type: ["string", "null"] },
        tags: { type: "array", items: { type: "string" }, maxItems: 12, description: `Suggested actions include: ${TICKET_ACTIONS.join(", ")}.` },
        details: { type: ["string", "null"] },
        due_date: { ...dateProperty, type: ["string", "null"] },
        priority: { type: "string", enum: TICKET_PRIORITIES },
        email: { type: ["string", "null"] },
      },
      ["agency_id", "title"]
    ),
  },
  {
    name: "complete_ticket",
    description: "Mark a ticket done, or restore it to open with done=false. Tickets are retained for history.",
    inputSchema: objectSchema(
      {
        ticket_id: { type: "string", description: "Ticket UUID." },
        done: { type: "boolean", description: "Default true. False restores an accidentally completed ticket." },
      },
      ["ticket_id"]
    ),
  },
];

function limitValue(value, fallback = 50) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 200) : fallback;
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

function requireText(value, field) {
  const result = cleanText(value);
  if (!result) throw new Error(`${field} is required.`);
  return result;
}

function validDate(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${field} must use YYYY-MM-DD format.`);
  }
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`${field} is not a valid calendar date.`);
  }
  return normalized;
}

function normalizePhoneNumbers(values) {
  if (!Array.isArray(values)) throw new Error("phone_numbers must be an array of strings.");
  return [...new Set(values.map(cleanText).filter(Boolean))].slice(0, 20);
}

function normalizeTags(values) {
  if (values === undefined) return [];
  if (!Array.isArray(values)) throw new Error("tags must be an array of strings.");
  return [...new Set(values.map(cleanText).filter(Boolean))].slice(0, 12);
}

async function readAgency(id, select = "*") {
  const { data, error } = await supabaseServer().from("agencies").select(select).eq("id", id).single();
  if (error) throw new Error(error.message);
  return data;
}

async function readAgencyOverview(id) {
  const { data, error } = await supabaseServer()
    .from("agency_overview")
    .select(AGENCY_OVERVIEW_FIELDS)
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  const [withSchedule] = await overlayEarliestSchedules([data]);
  return withSchedule;
}

async function resolveStatus({ status_id, status_name } = {}) {
  if (status_id && status_name) throw new Error("Provide status_id or status_name, not both.");
  if (!status_id && !status_name) return null;

  let query = supabaseServer().from("statuses").select("id, name, color, is_closed, sort_order");
  query = status_id ? query.eq("id", status_id) : query.eq("name", requireText(status_name, "status_name"));
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("The requested status does not exist. Use list_statuses for valid values.");
  return data;
}

async function overlayEarliestSchedules(agencies) {
  if (!agencies.length) return agencies;
  const agencyIds = agencies.map((agency) => agency.id);
  const { data, error } = await supabaseServer()
    .from("scheduled_followups")
    .select("id, agency_id, date, reason, created_at")
    .in("agency_id", agencyIds)
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const earliest = new Map();
  for (const scheduled of data || []) {
    if (!earliest.has(scheduled.agency_id)) earliest.set(scheduled.agency_id, scheduled);
  }
  return agencies.map((agency) => {
    const next = earliest.get(agency.id);
    return {
      ...agency,
      next_scheduled_followup_id: next?.id || null,
      next_followup_date: next?.date || null,
      next_followup_note: next?.reason || null,
    };
  });
}

async function listAgencies(args = {}) {
  let query = supabaseServer()
    .from("agency_overview")
    .select(AGENCY_OVERVIEW_FIELDS)
    .order("name", { ascending: true })
    .limit(500);

  if (cleanText(args.search)) query = query.ilike("name", `%${cleanText(args.search)}%`);
  if (cleanText(args.status_name)) query = query.eq("status", cleanText(args.status_name));
  if (typeof args.needs_followup === "boolean") query = query.eq("needs_followup", args.needs_followup);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = await overlayEarliestSchedules(data || []);
  if (args.missing_contact_only) {
    rows = rows.filter((row) => {
      const phones = Array.isArray(row.phone_numbers) ? row.phone_numbers.filter(cleanText) : [];
      return phones.length === 0 && !cleanText(row.phone) && !cleanText(row.mobile_alt);
    });
  }
  if (args.scheduled_only) rows = rows.filter((row) => row.next_scheduled_followup_id);
  return rows.slice(0, limitValue(args.limit));
}

async function getAgency(args = {}) {
  if ((args.id && args.name) || (!args.id && !cleanText(args.name))) {
    throw new Error("Provide exactly one of id or name.");
  }

  let query = supabaseServer().from("agency_overview").select(AGENCY_OVERVIEW_FIELDS).limit(10);
  query = args.id ? query.eq("id", args.id) : query.ilike("name", `%${cleanText(args.name)}%`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const agencies = await overlayEarliestSchedules(data || []);
  return Promise.all(
    agencies.map(async (agency) => {
      const [notes, contactHistory, scheduledFollowups, tickets] = await Promise.all([
        listAgencyNotes({ agency_id: agency.id, limit: 50 }),
        listContactHistory({ agency_id: agency.id, limit: 50 }),
        listScheduledFollowups({ agency_id: agency.id, limit: 50 }),
        listTickets({ agency_id: agency.id, state: "all", limit: 50 }),
      ]);
      return { agency, notes, contact_history: contactHistory, scheduled_followups: scheduledFollowups, tickets };
    })
  );
}

async function updateAgencyContact(args = {}) {
  const id = requireText(args.id, "id");
  if (hasOwn(args, "phone_numbers") && (hasOwn(args, "phone") || hasOwn(args, "mobile_alt"))) {
    throw new Error("Use phone_numbers or legacy phone/mobile_alt inputs, not both.");
  }

  const suppliedContactField = CONTACT_FIELDS.some((field) => hasOwn(args, field));
  const suppliedPhones = ["phone_numbers", "phone", "mobile_alt"].some((field) => hasOwn(args, field));
  const note = cleanText(args.note);
  if (!suppliedContactField && !suppliedPhones && !note) {
    throw new Error("Provide at least one contact field, phone number, or note.");
  }

  const current = await readAgency(id, "id, phone, mobile_alt, phone_numbers");
  const update = {};
  for (const field of CONTACT_FIELDS) {
    if (hasOwn(args, field)) update[field] = cleanText(args[field]);
  }

  if (suppliedPhones) {
    let phones;
    if (hasOwn(args, "phone_numbers")) {
      phones = normalizePhoneNumbers(args.phone_numbers);
    } else {
      const currentPhones = normalizePhoneNumbers([
        ...(Array.isArray(current.phone_numbers) ? current.phone_numbers : []),
        current.phone,
        current.mobile_alt,
      ]);
      const primary = hasOwn(args, "phone") ? cleanText(args.phone) : cleanText(current.phone);
      const alternate = hasOwn(args, "mobile_alt") ? cleanText(args.mobile_alt) : cleanText(current.mobile_alt);
      const legacyValues = new Set([cleanText(current.phone), cleanText(current.mobile_alt)].filter(Boolean));
      phones = normalizePhoneNumbers([primary, alternate, ...currentPhones.filter((phone) => !legacyValues.has(phone))]);
    }
    update.phone_numbers = phones;
    update.phone = phones[0] || null;
    update.mobile_alt = phones[1] || null;
  }

  if (Object.keys(update).length) {
    const { error } = await supabaseServer().from("agencies").update(update).eq("id", id);
    if (error) throw new Error(error.message);
  }

  let createdNote = null;
  if (note) {
    const stamp = new Date().toISOString().slice(0, 10);
    createdNote = await addAgencyNote({ agency_id: id, content: `MCP contact update (${stamp}): ${note}` });
  }
  return { agency: await readAgencyOverview(id), note: createdNote };
}

async function updateAgency(args = {}) {
  const id = requireText(args.id, "id");
  const status = await resolveStatus(args);
  const update = {};

  for (const field of DETAIL_FIELDS) {
    if (!hasOwn(args, field)) continue;
    const value = args[field];
    if (field === "name") update[field] = requireText(value, "name");
    else if (field === "active_listings") {
      if (!Number.isInteger(value) || value < 0) throw new Error("active_listings must be a non-negative integer.");
      update[field] = value;
    } else if (field === "discount_percent") {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new Error("discount_percent must be a non-negative number.");
      }
      update[field] = value;
    } else if (field === "qualified" || field === "needs_followup") {
      if (typeof value !== "boolean") throw new Error(`${field} must be true or false.`);
      update[field] = value;
    } else if (field === "date_first_contacted" || field === "trial_start_date") {
      update[field] = validDate(value, field);
    } else {
      update[field] = cleanText(value);
    }
  }
  if (status) update.status_id = status.id;
  if (!Object.keys(update).length) throw new Error("No editable agency fields were provided.");

  await readAgency(id, "id");
  const { error } = await supabaseServer().from("agencies").update(update).eq("id", id);
  if (error) throw new Error(error.message);
  return readAgencyOverview(id);
}

async function listStatuses() {
  const { data, error } = await supabaseServer()
    .from("statuses")
    .select("id, name, color, is_closed, sort_order, created_at")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

async function listAgencyNotes(args = {}) {
  const agencyId = requireText(args.agency_id, "agency_id");
  const { data, error } = await supabaseServer()
    .from("agency_notes")
    .select("*, agencies(name)")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false })
    .limit(limitValue(args.limit));
  if (error) throw new Error(error.message);
  return (data || []).map(({ agencies, ...note }) => ({ ...note, agency_name: agencies?.name || "" }));
}

async function addAgencyNote(args = {}) {
  const agencyId = requireText(args.agency_id, "agency_id");
  const content = requireText(args.content, "content");
  await readAgency(agencyId, "id");
  const { data, error } = await supabaseServer()
    .from("agency_notes")
    .insert({ agency_id: agencyId, content })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function listContactHistory(args = {}) {
  let query = supabaseServer()
    .from("followups")
    .select("*, agencies(name)")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limitValue(args.limit));
  if (cleanText(args.agency_id)) query = query.eq("agency_id", cleanText(args.agency_id));
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map(({ agencies, ...contact }) => ({ ...contact, agency_name: agencies?.name || "" }));
}

async function logContact(args = {}) {
  const agencyId = requireText(args.agency_id, "agency_id");
  const status = await resolveStatus(args);
  const method = args.method || "Phone Call";
  if (!CONTACT_METHODS.includes(method)) {
    throw new Error(`method must be one of: ${CONTACT_METHODS.join(", ")}.`);
  }
  await readAgency(agencyId, "id");

  const { data, error } = await supabaseServer()
    .from("followups")
    .insert({
      agency_id: agencyId,
      date: validDate(args.date, "date") || new Date().toISOString().slice(0, 10),
      method,
      discussed: cleanText(args.discussed),
      outcome: cleanText(args.outcome),
      next_step: cleanText(args.next_step),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (status) {
    const { error: statusError } = await supabaseServer()
      .from("agencies")
      .update({ status_id: status.id })
      .eq("id", agencyId);
    if (statusError) throw new Error(`Contact was logged, but status update failed: ${statusError.message}`);
  }
  return { contact: data, status: status || undefined };
}

async function listScheduledFollowups(args = {}) {
  let query = supabaseServer()
    .from("scheduled_followups")
    .select("*, agencies(name, status_id)")
    .order("date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limitValue(args.limit));
  if (cleanText(args.agency_id)) query = query.eq("agency_id", cleanText(args.agency_id));
  if (hasOwn(args, "from_date")) query = query.gte("date", validDate(args.from_date, "from_date"));
  if (hasOwn(args, "through_date")) query = query.lte("date", validDate(args.through_date, "through_date"));
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map(({ agencies, ...scheduled }) => ({
    ...scheduled,
    agency_name: agencies?.name || "",
    agency_status_id: agencies?.status_id || null,
  }));
}

async function scheduleFollowup(args = {}) {
  const agencyId = requireText(args.agency_id, "agency_id");
  const date = validDate(args.date, "date");
  if (!date) throw new Error("date is required.");
  await readAgency(agencyId, "id");
  const { data, error } = await supabaseServer()
    .from("scheduled_followups")
    .insert({ agency_id: agencyId, date, reason: cleanText(args.reason) })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function completeScheduledFollowup(args = {}) {
  const scheduledId = requireText(args.scheduled_followup_id, "scheduled_followup_id");
  const { data: scheduled, error: readError } = await supabaseServer()
    .from("scheduled_followups")
    .select("*")
    .eq("id", scheduledId)
    .single();
  if (readError) throw new Error(readError.message);

  const logged = await logContact({
    agency_id: scheduled.agency_id,
    date: args.date,
    method: args.method,
    discussed: args.discussed,
    outcome: args.outcome,
    next_step: args.next_step,
    status_id: args.status_id,
    status_name: args.status_name,
  });
  const { error: deleteError } = await supabaseServer().from("scheduled_followups").delete().eq("id", scheduledId);
  if (deleteError) {
    throw new Error(`Contact was logged, but the scheduled item could not be cleared: ${deleteError.message}`);
  }
  return { completed_schedule: scheduled, ...logged };
}

async function listTickets(args = {}) {
  const state = args.state || "open";
  if (!["open", "done", "all"].includes(state)) throw new Error("state must be open, done, or all.");
  if (args.priority && !TICKET_PRIORITIES.includes(args.priority)) {
    throw new Error(`priority must be one of: ${TICKET_PRIORITIES.join(", ")}.`);
  }

  const requestedLimit = limitValue(args.limit);

  let query = supabaseServer()
    .from("tickets")
    .select(TICKET_SELECT)
    .order("done", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(args.priority ? 500 : requestedLimit);
  if (cleanText(args.agency_id)) query = query.eq("agency_id", cleanText(args.agency_id));
  if (state !== "all") query = query.eq("done", state === "done");
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let tickets = (data || []).map(normalizeTicket);
  if (args.priority) tickets = tickets.filter((ticket) => ticket.priority === args.priority);
  return tickets.slice(0, requestedLimit);
}

async function createTicket(args = {}) {
  const agencyId = requireText(args.agency_id, "agency_id");
  const title = requireText(args.title, "title");
  const tags = normalizeTags(args.tags);
  const priority = normalizeTicketPriority(args.priority);
  const email = cleanText(args.email);
  const details = cleanText(args.details);
  const dueDate = validDate(args.due_date, "due_date");
  const type = cleanText(args.type);
  await readAgency(agencyId, "id");

  const baseInsert = { agency_id: agencyId, title, type, due_date: dueDate };
  let { data, error } = await supabaseServer()
    .from("tickets")
    .insert({ ...baseInsert, tags: withTicketPriority(tags, priority, email), details })
    .select(TICKET_SELECT)
    .single();

  if (error && isMissingRichTicketColumns(error)) {
    ({ data, error } = await supabaseServer()
      .from("tickets")
      .insert({ ...baseInsert, type: encodeLegacyTicketMeta({ tags, details, type, priority, email }) })
      .select(TICKET_SELECT)
      .single());
  }
  if (error) throw new Error(error.message);
  return normalizeTicket(data);
}

async function completeTicket(args = {}) {
  const ticketId = requireText(args.ticket_id, "ticket_id");
  const done = hasOwn(args, "done") ? args.done : true;
  if (typeof done !== "boolean") throw new Error("done must be true or false.");
  const { data, error } = await supabaseServer()
    .from("tickets")
    .update({ done, completed_at: done ? new Date().toISOString() : null })
    .eq("id", ticketId)
    .select(TICKET_SELECT)
    .single();
  if (error) throw new Error(error.message);
  return normalizeTicket(data);
}

const TOOL_HANDLERS = {
  list_agencies: listAgencies,
  get_agency: getAgency,
  update_agency_contact: updateAgencyContact,
  update_agency: updateAgency,
  list_statuses: listStatuses,
  list_agency_notes: listAgencyNotes,
  add_agency_note: addAgencyNote,
  list_contact_history: listContactHistory,
  log_contact: logContact,
  list_scheduled_followups: listScheduledFollowups,
  schedule_followup: scheduleFollowup,
  complete_scheduled_followup: completeScheduledFollowup,
  list_tickets: listTickets,
  create_ticket: createTicket,
  complete_ticket: completeTicket,
};

export async function callMcpTool(name, args = {}) {
  const handler = TOOL_HANDLERS[name];
  if (!handler) throw new Error(`Unknown tool: ${name}`);
  return handler(args || {});
}
