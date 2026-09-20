import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(request) {
  const agencyId = new URL(request.url).searchParams.get("agency_id");
  if (!agencyId) return NextResponse.json({ error: "agency_id is required." }, { status: 400 });

  const { data, error } = await supabaseServer()
    .from("agency_notes")
    .select("*")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request) {
  const body = await request.json();
  const content = body?.content?.trim();
  if (!body?.agency_id || !content) {
    return NextResponse.json({ error: "agency_id and note content are required." }, { status: 400 });
  }

  const { data, error } = await supabaseServer()
    .from("agency_notes")
    .insert({ agency_id: body.agency_id, content })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
