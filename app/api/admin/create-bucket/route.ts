import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server not configured with service role key" }, { status: 500 });
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data, error } = await admin.storage.createBucket("resumes", { public: false });
    if (error) {
      return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
