import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("agency_overview")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function POST(request) {
  const supabase = supabaseServer();
  const body = await request.json();

  if (!body?.name || !body.name.trim()) {
    return NextResponse.json({ error: "Agency name is required." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("agencies")
    .insert({ name: body.name.trim() })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}
