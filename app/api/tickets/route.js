import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(request) {
  const supabase = supabaseServer();
  const { searchParams } = new URL(request.url);
  const agencyId = searchParams.get("agency_id");

  let query = supabase
    .from("tickets")
    .select("*, agencies(name)")
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
  const flattened = (data || []).map((t) => ({
    ...t,
    agency_name: t.agencies?.name || "",
    agencies: undefined,
  }));

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

  const { data, error } = await supabase
    .from("tickets")
    .insert({
      agency_id: body.agency_id,
      title: body.title.trim(),
      type: body.type?.trim() || null,
      due_date: body.due_date || null,
    })
    .select("*, agencies(name)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: { ...data, agency_name: data.agencies?.name || "", agencies: undefined } });
}
