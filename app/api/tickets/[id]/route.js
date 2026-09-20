import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  decodeLegacyTicketMeta,
  encodeLegacyTicketMeta,
  isMissingRichTicketColumns,
  normalizeTicket,
} from "@/lib/ticketData";

const EDITABLE_FIELDS = ["title", "type", "tags", "details", "due_date", "done"];
const AGENCY_SELECT =
  "*, agencies(name, contact_person, email, phone, mobile_alt, website, oglasnik_profil, location)";

export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = supabaseServer();
  const body = await request.json();

  const update = {};
  for (const key of Object.keys(body)) {
    if (EDITABLE_FIELDS.includes(key)) {
      update[key] = body[key];
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
  }

  // Completing a ticket stamps when; restoring one clears that stamp.
  if ("done" in update) {
    update.completed_at = update.done ? new Date().toISOString() : null;
  }

  let { data, error } = await supabase
    .from("tickets")
    .update(update)
    .eq("id", id)
    .select(AGENCY_SELECT)
    .single();

  if (error && isMissingRichTicketColumns(error) && ("tags" in update || "details" in update)) {
    const { data: current, error: readError } = await supabase
      .from("tickets")
      .select("type")
      .eq("id", id)
      .single();

    if (readError) {
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }

    const legacy = decodeLegacyTicketMeta(current.type);
    const fallbackUpdate = { ...update };
    delete fallbackUpdate.tags;
    delete fallbackUpdate.details;
    fallbackUpdate.type = encodeLegacyTicketMeta({
      tags: update.tags ?? legacy?.tags ?? (current.type && !legacy ? [current.type] : []),
      details: update.details ?? legacy?.details ?? null,
      type: update.type ?? legacy?.type ?? (legacy ? null : current.type),
    });

    ({ data, error } = await supabase
      .from("tickets")
      .update(fallbackUpdate)
      .eq("id", id)
      .select(AGENCY_SELECT)
      .single());
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: normalizeTicket(data) });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = supabaseServer();
  const { error } = await supabase.from("tickets").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
