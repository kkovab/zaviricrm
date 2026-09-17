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

  // New agencies start out at the "Not Contacted" status (falling back to
  // whichever status sorts first, in case "Not Contacted" was renamed).
  let statusId = null;
  const { data: defaultStatus } = await supabase
    .from("statuses")
    .select("id")
    .eq("name", "Not Contacted")
    .maybeSingle();
  if (defaultStatus) {
    statusId = defaultStatus.id;
  } else {
    const { data: firstStatus } = await supabase
      .from("statuses")
      .select("id")
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    statusId = firstStatus?.id ?? null;
  }

  const { data, error } = await supabase
    .from("agencies")
    .insert({ name: body.name.trim(), status_id: statusId })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}
