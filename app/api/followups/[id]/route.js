import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

// A contact log can be corrected after it is saved. Outcome remains legacy
// data; status lives on the agency itself and is updated through the contact
// composer rather than per history item.
const EDITABLE_FIELDS = ["date", "method", "discussed", "next_step"];

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
    .from("followups")
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
  const { error } = await supabase.from("followups").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
