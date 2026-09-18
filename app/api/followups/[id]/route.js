import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

// Only the date and the description ("discussed") can be edited from the
// History list in the Follow-ups drawer - method/outcome/next_step aren't
// exposed there any more, so they're left alone.
const EDITABLE_FIELDS = ["date", "discussed"];

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
