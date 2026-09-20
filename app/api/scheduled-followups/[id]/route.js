import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function PATCH(request, { params }) {
  const { id } = await params;
  const body = await request.json();
  const update = {};
  if (body.date) update.date = body.date;
  if (Object.hasOwn(body, "reason")) update.reason = body.reason || null;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No fields provided." }, { status: 400 });

  const { data, error } = await supabaseServer().from("scheduled_followups").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const { error } = await supabaseServer().from("scheduled_followups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
