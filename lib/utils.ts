import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type RetryOptions = {
  retries?: number;
  delayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: unknown) => boolean;
};

type GeminiConfig = {
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  retries?: number;
};

export type ResumeEnrichmentResult = {
  llm_summary: string;
  llm_skills: string[];
  llm_roles: string[];
  llm_experience_years: number | null;
};

export type ResumeMatchInput = {
  role: string;
  skills: string[];
  experience: string;
  keywords: string[];
};

export type ResumeStructuredData = {
  llm_summary?: string | null;
  llm_skills?: string[] | null;
  llm_roles?: string[] | null;
  llm_experience_years?: number | null;
  extracted_text?: string | null;
};

export type ResumeMatchResult = {
  match_score: number;
  matched_skills: string[];
  missing_skills: string[];
  match_summary: string;
};

const DEFAULT_GEMINI_MODEL = "gemini-1.5-flash";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isServerRuntime(): boolean {
  return typeof window === "undefined";
}

function requireServerRuntime(operation: string): void {
  if (!isServerRuntime()) {
    throw new Error(`${operation} must run on the server.`);
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const delayMs = options.delayMs ?? 600;
  const backoffMultiplier = options.backoffMultiplier ?? 2;
  const shouldRetry = options.shouldRetry ?? (() => true);

  let attempt = 0;
  let nextDelay = delayMs;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      const canRetry = attempt < retries && shouldRetry(error);
      if (!canRetry) throw error;
      await sleep(nextDelay);
      nextDelay = Math.ceil(nextDelay * backoffMultiplier);
      attempt += 1;
    }
  }
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return [...new Set(normalized)];
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function parseJsonObject<T>(raw: string): T {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("LLM response must be a JSON object.");
  }
  return parsed as T;
}

function extractCandidateJson(text: string): string {
  const trimmed = text.trim();
  const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeFenceMatch?.[1]) return codeFenceMatch[1].trim();
  return trimmed;
}

function validateEnrichmentResult(data: unknown): ResumeEnrichmentResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid enrichment payload.");
  }

  const obj = data as Record<string, unknown>;
  const llm_summary = typeof obj.llm_summary === "string" ? obj.llm_summary.trim() : "";
  const llm_skills = normalizeStringList(obj.llm_skills);
  const llm_roles = normalizeStringList(obj.llm_roles);
  const llm_experience_years = toNumberOrNull(obj.llm_experience_years);

  if (!llm_summary) {
    throw new Error("Invalid enrichment payload: llm_summary is required.");
  }

  return {
    llm_summary,
    llm_skills,
    llm_roles,
    llm_experience_years,
  };
}

function validateMatchResult(data: unknown): ResumeMatchResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid match payload.");
  }

  const obj = data as Record<string, unknown>;
  const summary = typeof obj.match_summary === "string" ? obj.match_summary.trim() : "";
  const matchScoreRaw = toNumberOrNull(obj.match_score);

  if (!summary) {
    throw new Error("Invalid match payload: match_summary is required.");
  }

  return {
    match_score: clampScore(matchScoreRaw ?? 0),
    matched_skills: normalizeStringList(obj.matched_skills),
    missing_skills: normalizeStringList(obj.missing_skills),
    match_summary: summary,
  };
}

function buildEnrichmentPrompt(resumeText: string): string {
  return [
    "Extract structured candidate information from the resume text.",
    "Return strict JSON only with this exact shape:",
    '{ "llm_summary": string, "llm_skills": string[], "llm_roles": string[], "llm_experience_years": number | null }',
    "Rules:",
    "- llm_summary: 2-4 sentence concise profile summary.",
    "- llm_skills: unique list of technical/professional skills.",
    "- llm_roles: unique list of inferred job roles/titles.",
    "- llm_experience_years: best estimate as a number, or null if unknown.",
    "- Do not include markdown/code fences.",
    "",
    "Resume Text:",
    resumeText,
  ].join("\n");
}

function buildMatchPrompt(requirements: ResumeMatchInput, resumeData: ResumeStructuredData): string {
  const safeRequirements = {
    role: requirements.role || "",
    skills: requirements.skills || [],
    experience: requirements.experience || "",
    keywords: requirements.keywords || [],
  };

  const safeResumeData = {
    llm_summary: resumeData.llm_summary || "",
    llm_skills: resumeData.llm_skills || [],
    llm_roles: resumeData.llm_roles || [],
    llm_experience_years: resumeData.llm_experience_years ?? null,
    extracted_text: resumeData.extracted_text || "",
  };

  return [
    "You are an AI resume matching assistant. Evaluate how well a resume matches job requirements.",
    "Return strict JSON only with this exact shape:",
    '{ "match_score": number, "matched_skills": string[], "missing_skills": string[], "match_summary": string }',
    "Scoring guidance:",
    "- match_score must be 0 to 100.",
    "- Evaluate semantic alignment across role, skills, experience, and overall relevance.",
    "- matched_skills should contain only skills present in both requirements and resume.",
    "- missing_skills should contain required skills not evident in the resume.",
    "- match_summary should be concise and specific.",
    "- Do not include markdown/code fences.",
    "",
    "Job Requirements:",
    JSON.stringify(safeRequirements),
    "",
    "Resume Data:",
    JSON.stringify(safeResumeData),
  ].join("\n");
}

function getGeminiConfig(config: GeminiConfig = {}): Required<GeminiConfig> {
  const apiKey = config.apiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  return {
    apiKey,
    model: config.model || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retries: config.retries ?? DEFAULT_RETRIES,
  };
}

function shouldRetryGemini(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  const message = error.message.toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("429") ||
    message.includes("503") ||
    message.includes("500")
  );
}

async function callGeminiJson<T>(prompt: string, config: GeminiConfig = {}): Promise<T> {
  requireServerRuntime("Gemini API calls");
  const gemini = getGeminiConfig(config);

  const run = async () => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      gemini.model
    )}:generateContent`;

    const response = await withTimeout(
      fetch(`${endpoint}?key=${encodeURIComponent(gemini.apiKey)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      }),
      gemini.timeoutMs,
      "Gemini request"
    );

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Gemini request failed (${response.status}): ${details || response.statusText}`);
    }

    const payload = await response.json();
    const text =
      payload?.candidates?.[0]?.content?.parts?.find((part: { text?: string }) => typeof part?.text === "string")
        ?.text || "";

    if (!text.trim()) {
      throw new Error("Gemini response did not include text content.");
    }

    const candidateJson = extractCandidateJson(text);
    return parseJsonObject<T>(candidateJson);
  };

  return retry(run, {
    retries: gemini.retries,
    shouldRetry: shouldRetryGemini,
  });
}

export const llmUtils = {
  withTimeout,
  retry,
};

export const llmPrompts = {
  buildEnrichmentPrompt,
  buildMatchPrompt,
};

export const llmSchemas = {
  validateEnrichmentResult,
  validateMatchResult,
};

export async function enrichResume(resumeText: string, config: GeminiConfig = {}): Promise<ResumeEnrichmentResult> {
  const text = String(resumeText || "").trim();
  if (!text) {
    throw new Error("Cannot enrich empty resume text.");
  }

  const prompt = buildEnrichmentPrompt(text);
  const payload = await callGeminiJson<unknown>(prompt, config);
  return validateEnrichmentResult(payload);
}

export async function matchResume(
  requirements: ResumeMatchInput,
  resumeData: ResumeStructuredData,
  config: GeminiConfig = {}
): Promise<ResumeMatchResult> {
  const prompt = buildMatchPrompt(requirements, resumeData);
  const payload = await callGeminiJson<unknown>(prompt, config);
  return validateMatchResult(payload);
}
