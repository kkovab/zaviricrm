import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(request) {
  const agencyId = new URL(request.url).searchParams.get("agency_id");
  if (!agencyId) return NextResponse.json({ error: "agency_id is required." }, { status: 400 });

  const { data, error } = await supabaseServer()
    .from("scheduled_followups")
    .select("*")
    .eq("agency_id", agencyId)
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request) {
  const body = await request.json();
  if (!body?.agency_id || !body?.date) {
    return NextResponse.json({ error: "agency_id and date are required." }, { status: 400 });
  }

  const { data, error } = await supabaseServer()
    .from("scheduled_followups")
    .insert({ agency_id: body.agency_id, date: body.date, reason: body.reason || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
