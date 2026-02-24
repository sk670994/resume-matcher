import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

export async function POST(req: Request) {
  let admin: ReturnType<typeof createClient> | null = null;
  let resumeId: string | null = null;

  async function setResumeStatus(status: "extracting" | "ready" | "error") {
    if (!admin || !resumeId) return;
    await admin.from("resumes").update({ status }).eq("id", resumeId);
  }

  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return NextResponse.json(
        {
          error:
            "Server missing Supabase config. Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        },
        { status: 500 }
      );
    }

    // Read request body
    const body = await req.json().catch(() => ({}));
    const path = body?.path;
    resumeId = body?.resumeId;

    if (!path || !resumeId) {
      return NextResponse.json({ error: "Missing path or resumeId in request body" }, { status: 400 });
    }

    // Create admin client inside handler (avoid module-scope creation)
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Fetch the resume row
    const { data: resumeRow, error: fetchError } = await admin.from("resumes").select("*").eq("id", resumeId).single();
    if (fetchError || !resumeRow) {
      return NextResponse.json({ error: fetchError?.message || "Resume not found" }, { status: 404 });
    }

    // Start extraction and clear stale AI fields from earlier attempts.
    await admin
      .from("resumes")
      .update({
        status: "extracting",
        llm_summary: null,
        llm_skills: null,
        llm_roles: null,
        llm_experience_years: null,
        llm_processed_at: null,
        llm_match: null,
      })
      .eq("id", resumeId);

    // Download file from storage
    const { data: downloadData, error: downloadError } = await admin.storage.from("resumes").download(path);
    if (downloadError) {
      await setResumeStatus("error");
      return NextResponse.json({ error: downloadError.message }, { status: 500 });
    }

    const arrayBuffer = await downloadData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let extractedText = "";

    // Choose extractor by content type or path
    const contentType = (resumeRow as any).content_type || "";
    const lowerPath = String(path).toLowerCase();

    try {
      if (contentType.includes("pdf") || lowerPath.endsWith(".pdf")) {
        const pdfRes: any = await pdfParse(buffer as any);
        extractedText = pdfRes?.text || "";
      } else if (contentType.includes("word") || lowerPath.endsWith(".docx") || lowerPath.endsWith(".doc")) {
        const mammothRes = await mammoth.extractRawText({ buffer });
        extractedText = mammothRes?.value || "";
      } else {
        // Fallback: try pdf parser first
        try {
          const pdfRes: any = await pdfParse(buffer as any);
          extractedText = pdfRes?.text || "";
        } catch (e) {
          extractedText = buffer.toString("utf8");
        }
      }
    } catch (err: any) {
      await setResumeStatus("error");
      return NextResponse.json({ error: "Extraction failed: " + (err?.message || String(err)) }, { status: 500 });
    }

    // Update DB with extracted text and mark ready (PR4 will move ready after LLM enrichment).
    await admin.from("resumes").update({ extracted_text: extractedText }).eq("id", resumeId);
    await setResumeStatus("ready");

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    await setResumeStatus("error");
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
