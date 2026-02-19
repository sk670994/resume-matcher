import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Server-side route to generate a signed URL for a resume file.
// POST body: { path: string }
// Requires Authorization: Bearer <access_token> header from client session.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.warn("SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL not set");
}

const admin = createClient(SUPABASE_URL || "", SERVICE_ROLE_KEY || "");

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { path } = body;
    if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 });

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/Bearer\s*/i, "");
    if (!token) return NextResponse.json({ error: "Missing auth token" }, { status: 401 });

    // Validate token and get user
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    const user = userData.user;

    // Verify ownership in 'resumes' table
    const { data: rows, error: rowsError } = await admin
      .from("resumes")
      .select("id")
      .eq("path", path)
      .eq("user_id", user.id)
      .limit(1);

    if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });
    if (!rows || rows.length === 0) return NextResponse.json({ error: "Not found or not authorized" }, { status: 404 });

    // Create signed URL valid for 5 minutes
    const ttlSeconds = 60 * 5;
    const { data: signedData, error: signedError } = await admin.storage.from("resumes").createSignedUrl(path, ttlSeconds);
    if (signedError) return NextResponse.json({ error: signedError.message }, { status: 500 });

    return NextResponse.json({ signedUrl: signedData.signedUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
