import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const EDITABLE_FIELDS = ["title", "type", "due_date", "done"];

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

  const { data, error } = await supabase
    .from("tickets")
    .update(update)
    .eq("id", id)
    .select("*, agencies(name)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: { ...data, agency_name: data.agencies?.name || "", agencies: undefined } });
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
