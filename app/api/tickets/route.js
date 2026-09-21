import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  encodeLegacyTicketMeta,
  isMissingRichTicketColumns,
  normalizeTicketPriority,
  normalizeTicket,
  withTicketPriority,
} from "@/lib/ticketData";

const AGENCY_SELECT =
  "*, agencies(name, contact_person, email, phone, mobile_alt, website, oglasnik_profil, location)";

export async function GET(request) {
  const supabase = supabaseServer();
  const { searchParams } = new URL(request.url);
  const agencyId = searchParams.get("agency_id");

  let query = supabase
    .from("tickets")
    .select(AGENCY_SELECT)
    .order("done", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (agencyId) {
    query = query.eq("agency_id", agencyId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten the joined agency name so the frontend doesn't need to know
  // about the nested shape Supabase returns for embedded selects.
  const flattened = (data || []).map(normalizeTicket);

  return NextResponse.json({ data: flattened });
}

export async function POST(request) {
  const supabase = supabaseServer();
  const body = await request.json();

  if (!body?.agency_id) {
    return NextResponse.json({ error: "agency_id is required." }, { status: 400 });
  }
  if (!body?.title || !body.title.trim()) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }

  const tags = Array.isArray(body.tags)
    ? body.tags.filter((tag) => typeof tag === "string" && tag.trim()).slice(0, 12)
    : [];
  const priority = normalizeTicketPriority(body.priority);
  const email = body.email?.trim() || null;
  const storedTags = withTicketPriority(tags, priority, email);
  const details = body.details?.trim() || null;
  const baseInsert = {
    agency_id: body.agency_id,
    title: body.title.trim(),
    type: body.type?.trim() || null,
    due_date: body.due_date || null,
  };

  let { data, error } = await supabase
    .from("tickets")
    .insert({
      ...baseInsert,
      tags: storedTags,
      details,
    })
    .select(AGENCY_SELECT)
    .single();

  // Keep production usable before schema.sql has been re-run. No data is
  // lost: the API transparently decodes this metadata on subsequent reads.
  if (error && isMissingRichTicketColumns(error)) {
    ({ data, error } = await supabase
      .from("tickets")
      .insert({
        ...baseInsert,
        type: encodeLegacyTicketMeta({ tags, details, type: baseInsert.type, priority, email }),
      })
      .select(AGENCY_SELECT)
      .single());
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: normalizeTicket(data) });
}
