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

  // Multiple scheduled follow-ups live in their own table. Overlay the
  // earliest one onto the existing overview shape so the main grid stays
  // simple and always shows the next thing that is actually due.
  const { data: scheduled, error: scheduledError } = await supabase
    .from("scheduled_followups")
    .select("agency_id, date, reason, created_at")
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });

  // Before the manual migration is run, keep the legacy one-follow-up app
  // working instead of failing the entire agency list.
  if (scheduledError) return NextResponse.json({ data });

  const nextByAgency = new Map();
  for (const scheduledFollowup of scheduled || []) {
    if (!nextByAgency.has(scheduledFollowup.agency_id)) {
      nextByAgency.set(scheduledFollowup.agency_id, scheduledFollowup);
    }
  }
  const dataWithEarliestSchedule = (data || []).map((agency) => {
    const next = nextByAgency.get(agency.id);
    return next
      ? { ...agency, next_followup_date: next.date, next_followup_note: next.reason }
      : { ...agency, next_followup_date: null, next_followup_note: null };
  });

  return NextResponse.json({ data: dataWithEarliestSchedule });
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
