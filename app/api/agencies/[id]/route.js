import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

// Only these columns can be edited directly from the grid. Computed columns
// (from the agency_overview view) are never written back.
const EDITABLE_FIELDS = [
  "name",
  "contact_person",
  "phone",
  "mobile_alt",
  "email",
  "location",
  "active_listings",
  "qualified",
  "needs_followup",
  "oglasnik_profil",
  "website",
  "status_id",
  "date_first_contacted",
  "trial_start_date",
  "next_followup_date",
  "discount_offered",
  "discount_percent",
  "what_they_know",
  "what_they_still_need",
  "notes",
];

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

  const { data, error } = await supabase
    .from("agencies")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = supabaseServer();
  const { error } = await supabase.from("agencies").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
