import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from("statuses")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function POST(request) {
  const supabase = supabaseServer();
  const body = await request.json();

  if (!body?.name || !body.name.trim()) {
    return NextResponse.json({ error: "Status name is required." }, { status: 400 });
  }

  // New statuses go to the end of the order.
  const { data: lastStatus } = await supabase
    .from("statuses")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (lastStatus?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("statuses")
    .insert({
      name: body.name.trim(),
      color: body.color || "#737373",
      is_closed: !!body.is_closed,
      sort_order: nextOrder,
    })
    .select()
    .single();

  if (error) {
    const message = error.code === "23505" ? "A status with that name already exists." : error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
  return NextResponse.json({ data });
}
