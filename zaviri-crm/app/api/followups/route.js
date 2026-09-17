import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(request) {
  const supabase = supabaseServer();
  const { searchParams } = new URL(request.url);
  const agencyId = searchParams.get("agency_id");

  if (!agencyId) {
    return NextResponse.json({ error: "agency_id is required." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("followups")
    .select("*")
    .eq("agency_id", agencyId)
    .order("date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function POST(request) {
  const supabase = supabaseServer();
  const body = await request.json();

  if (!body?.agency_id) {
    return NextResponse.json({ error: "agency_id is required." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("followups")
    .insert({
      agency_id: body.agency_id,
      date: body.date || new Date().toISOString().slice(0, 10),
      method: body.method || "Phone Call",
      discussed: body.discussed || null,
      outcome: body.outcome || null,
      next_step: body.next_step || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}
