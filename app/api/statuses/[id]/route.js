import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

// Only these fields can be edited directly (rename, recolor, mark
// closed/open, or reorder).
const EDITABLE_FIELDS = ["name", "color", "is_closed", "sort_order"];

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
  if (typeof update.name === "string" && !update.name.trim()) {
    return NextResponse.json({ error: "Status name can't be empty." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("statuses")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    const message = error.code === "23505" ? "A status with that name already exists." : error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = supabaseServer();

  // Don't allow deleting a status that agencies are still sitting in - force
  // moving them to a different status first, so nothing silently loses its
  // pipeline stage.
  const { count, error: countError } = await supabase
    .from("agencies")
    .select("id", { count: "exact", head: true })
    .eq("status_id", id);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }
  if (count && count > 0) {
    return NextResponse.json(
      {
        error: `${count} agenc${count === 1 ? "y is" : "ies are"} still using this status. Move ${
          count === 1 ? "it" : "them"
        } to a different status first.`,
      },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("statuses").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
