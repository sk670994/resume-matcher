"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  buildRequirements,
  matchResumes,
  ResumeMatchResult,
} from "@/lib/matching";
import { supabase } from "@/lib/supabaseClient";

type ResumeRow = {
  id: string;
  user_id: string;
  file_name: string;
  path: string;
  content_type: string | null;
  size: number | null;
  uploaded_at: string;
  status: string | null;
  extracted_text: string | null;
};

type MatchFormState = {
  role: string;
  skills: string;
  experience: string;
  keywords: string;
};

const INITIAL_FORM: MatchFormState = {
  role: "",
  skills: "",
  experience: "",
  keywords: "",
};

function getConfidenceVariant(confidence: ResumeMatchResult["confidence"]) {
  if (confidence === "strong") return "default";
  if (confidence === "moderate") return "secondary";
  return "destructive";
}

function formatBreakdown(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [session, setSession] = useState<{ access_token?: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [extractingResumeId, setExtractingResumeId] = useState<string | null>(null);
  const [resumes, setResumes] = useState<ResumeRow[]>([]);
  const [bucketExists, setBucketExists] = useState<boolean | null>(null);
  const [creatingBucket, setCreatingBucket] = useState(false);
  const [requirements, setRequirements] = useState<MatchFormState>(INITIAL_FORM);
  const [matching, setMatching] = useState(false);
  const [matchMessage, setMatchMessage] = useState<string | null>(null);
  const [matchResults, setMatchResults] = useState<ResumeMatchResult[]>([]);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const response = await supabase.auth.getSession();
      if (!mounted) return;

      const currentSession = response.data.session;
      if (!currentSession) {
        router.replace("/auth");
        return;
      }

      const userId = currentSession.user?.id;
      if (!userId) {
        router.replace("/auth");
        return;
      }

      setSession(currentSession);
      setUser({ id: userId });
      setLoading(false);
      fetchResumes({ id: userId });
    };

    checkSession();
    return () => {
      mounted = false;
    };
  }, [router]);

  const checkBucketExists = async () => {
    try {
      const { error } = await supabase.storage.from("resumes").list("", { limit: 1 });
      setBucketExists(!error);
    } catch {
      setBucketExists(false);
    }
  };

  useEffect(() => {
    checkBucketExists();
  }, []);

  async function fetchResumes(currentUser: { id: string } | null) {
    if (!currentUser?.id) return;

    const { data, error } = await supabase
      .from("resumes")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("uploaded_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch resumes", error);
      return;
    }

    setResumes((data as ResumeRow[]) || []);
  }

  useEffect(() => {
    if (!user) return;

    const intervalId = setInterval(() => {
      fetchResumes(user);
    }, 10000);

    return () => clearInterval(intervalId);
  }, [user]);

  async function handleUpload() {
    setUploadMessage(null);

    if (!selectedFile) {
      setUploadMessage("Select a file to upload.");
      return;
    }

    const isPdfByType = selectedFile.type === "application/pdf";
    const isPdfByName = selectedFile.name.toLowerCase().endsWith(".pdf");
    if (!isPdfByType && !isPdfByName) {
      setUploadMessage("Only PDF files are allowed. Please upload a .pdf file.");
      return;
    }

    if (!user) {
      setUploadMessage("Not authenticated.");
      return;
    }

    setUploading(true);

    try {
      const filePath = `user_${user.id}/${Date.now()}_${selectedFile.name}`;

      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(filePath, selectedFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: insertedRows, error: insertError } = await supabase
        .from("resumes")
        .insert([
          {
            user_id: user.id,
            file_name: selectedFile.name,
            path: filePath,
            content_type: selectedFile.type,
            size: selectedFile.size,
          },
        ])
        .select();

      if (insertError) throw insertError;

      setUploadMessage("Upload successful.");

      const resumeId = insertedRows?.[0]?.id;
      if (resumeId) {
        await triggerExtraction(resumeId, filePath);
      }

      setSelectedFile(null);
      fetchResumes(user);
    } catch (error: any) {
      setUploadMessage(error?.message || String(error));
    } finally {
      setUploading(false);
    }
  }

  async function getSignedUrl(path: string) {
    if (!session?.access_token) return null;

    try {
      const response = await fetch("/api/signed-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ path }),
      });

      const data = await response.json();
      if (!response.ok) return null;
      return data.signedUrl || null;
    } catch {
      return null;
    }
  }

  async function handleView(path: string) {
    const signed = await getSignedUrl(path);
    if (signed) {
      window.open(signed, "_blank");
      return;
    }

    const publicUrl = supabase.storage.from("resumes").getPublicUrl(path).data.publicUrl;
    if (publicUrl) {
      window.open(publicUrl, "_blank");
    } else {
      setUploadMessage("Unable to get file URL.");
    }
  }

  async function triggerExtraction(resumeId: string, path: string) {
    if (!session?.access_token) {
      setUploadMessage("Missing session token. Please sign in again.");
      return;
    }

    setExtractingResumeId(resumeId);
    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ path, resumeId }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const apiError = data?.error || "Extraction request failed.";
        setUploadMessage(`Extraction failed: ${apiError}`);
        return;
      }

      setUploadMessage("Extraction started.");
    } catch (error: any) {
      setUploadMessage(error?.message || "Failed to start extraction.");
    } finally {
      setExtractingResumeId(null);
    }
  }

  function handleRequirementChange(field: keyof MatchFormState, value: string) {
    setRequirements((prev) => ({ ...prev, [field]: value }));
  }

  function runMatch() {
    setMatchMessage(null);
    setMatchResults([]);

    const hasAnyCriteria = Object.values(requirements).some((value) => value.trim().length > 0);
    if (!hasAnyCriteria) {
      setMatchMessage("Add at least one requirement before running match.");
      return;
    }

    const candidates = resumes.filter((resume) =>
      Boolean(resume.extracted_text && resume.extracted_text.trim().length > 0)
    );

    if (candidates.length === 0) {
      setMatchMessage("No extracted text found yet. Upload a resume and wait for extraction.");
      return;
    }

    setMatching(true);
    try {
      const builtRequirements = buildRequirements(requirements);
      const results = matchResumes(candidates, builtRequirements);
      setMatchResults(results);
      const topScore = results[0]?.score ?? 0;
      setMatchMessage(
        `Scored ${results.length} resume${results.length === 1 ? "" : "s"}. Top score: ${topScore}%.`
      );
    } catch (error: any) {
      setMatchMessage(error?.message || "Failed to run matching.");
    } finally {
      setMatching(false);
    }
  }

  if (loading) {
    return <div className="p-6">Checking session...</div>;
  }

  return (
    <main className="py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Resume Upload</CardTitle>
            <CardDescription>Upload PDF resumes and manage uploaded files.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3 rounded-md border p-3">
                <Label htmlFor="resume-file">Resume PDF</Label>
                <input
                  id="resume-file"
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                  aria-describedby="upload-status"
                  className="w-full rounded-md border p-2 text-sm"
                />
                <Button className="w-full" onClick={handleUpload} disabled={uploading}>
                  {uploading ? "Uploading..." : "Upload Resume"}
                </Button>

                {uploadMessage && (
                  <p id="upload-status" className="text-sm text-slate-700" aria-live="polite">
                    {uploadMessage}
                  </p>
                )}

                {bucketExists === false && (
                  <div className="mt-2 text-sm text-red-600">
                    <p>Bucket not found. Create a private `resumes` bucket in Supabase.</p>
                    <div className="mt-2 flex gap-2">
                      <a
                        href={
                          (() => {
                            try {
                              const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
                              const projectRef = new URL(url).hostname.split(".")[0];
                              return `https://app.supabase.com/project/${projectRef}/storage/buckets`;
                            } catch {
                              return "https://app.supabase.com";
                            }
                          })()
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        Open Supabase Storage
                      </a>
                      <a href="/supabase/migrations/001_create_resumes_table.sql" className="underline">
                        View migration
                      </a>
                      <button
                        onClick={async () => {
                          setCreatingBucket(true);
                          setUploadMessage(null);
                          try {
                            const response = await fetch("/api/admin/create-bucket", { method: "POST" });
                            const json = await response.json();
                            if (response.ok && json.ok) {
                              setUploadMessage("Bucket created. Run migrations next.");
                              await checkBucketExists();
                            } else {
                              setUploadMessage(json.error || "Failed to create bucket.");
                            }
                          } catch (error: any) {
                            setUploadMessage(error?.message || String(error));
                          } finally {
                            setCreatingBucket(false);
                          }
                        }}
                        className="ml-2 underline"
                        disabled={creatingBucket}
                      >
                        {creatingBucket ? "Creating..." : "Create bucket (server)"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <div>
                  <h2 className="text-base font-semibold">Uploaded Resumes</h2>
                  <p className="text-sm text-slate-600">Files, extraction status, and timestamps.</p>
                </div>
                {resumes.length === 0 ? (
                  <p>No resumes uploaded yet.</p>
                ) : (
                  <div className="max-h-[20rem] overflow-y-auto pr-2">
                    <ul className="space-y-3" aria-label="Uploaded resumes list">
                      {resumes.map((resume) => (
                        <li key={resume.id} className="flex justify-between gap-4 rounded-md border p-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{resume.file_name}</p>
                            <p className="text-xs text-slate-500">
                              {new Date(resume.uploaded_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={resume.status === "ready" ? "default" : "secondary"}>
                              {resume.status || "unknown"}
                            </Badge>
                            {resume.status !== "ready" && (
                              <Button
                                onClick={() => triggerExtraction(resume.id, resume.path)}
                                size="sm"
                                variant="secondary"
                                disabled={extractingResumeId === resume.id}
                              >
                                {extractingResumeId === resume.id ? "Extracting..." : "Extract"}
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => handleView(resume.path)}>
                              View
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Job Requirements and Matching Results</CardTitle>
            <CardDescription>
              Enter role, skills, experience, and keywords to score extracted resumes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="role">Role</Label>
                <Input
                  id="role"
                  placeholder="Frontend Engineer"
                  value={requirements.role}
                  onChange={(event) => handleRequirementChange("role", event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="skills">Skills</Label>
                <Input
                  id="skills"
                  placeholder="React, TypeScript, Next.js"
                  value={requirements.skills}
                  onChange={(event) => handleRequirementChange("skills", event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="experience">Experience</Label>
                <Input
                  id="experience"
                  placeholder="5 years, senior, lead"
                  value={requirements.experience}
                  onChange={(event) => handleRequirementChange("experience", event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="keywords">Keywords</Label>
                <Textarea
                  id="keywords"
                  placeholder="performance optimization, graphql, mentoring"
                  value={requirements.keywords}
                  onChange={(event) => handleRequirementChange("keywords", event.target.value)}
                />
              </div>
              <Button className="w-full" onClick={runMatch} disabled={matching}>
                {matching ? "Running..." : "Run Match"}
              </Button>
              {matchMessage && (
                <p className="text-sm text-slate-700" role="status" aria-live="polite">
                  {matchMessage}
                </p>
              )}
            </section>

            <Separator />

            <section className="space-y-4">
              <div>
                <h2 className="text-base font-semibold">Matching Results</h2>
                <p className="text-sm text-slate-600">
                  Ranked by weighted role, skills, experience, and keywords
                </p>
              </div>
              {matchResults.length === 0 ? (
                <p>No results yet.</p>
              ) : (
                <div className="space-y-4" aria-label="Match results list">
                  {matchResults.map((result, index) => (
                    <article
                      key={result.resumeId}
                      className="space-y-3 rounded-md border p-4"
                      aria-label={`Result ${index + 1}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {index + 1}. {result.fileName}
                          </p>
                          <p className="text-xs text-slate-500">
                            Skills matched: {result.matchedSkills.length} | Keywords matched:{" "}
                            {result.matchedKeywords.length}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={result.score >= 70 ? "default" : "secondary"}>
                            {result.score}% match
                          </Badge>
                          <Badge variant={getConfidenceVariant(result.confidence)}>
                            {result.confidence}
                          </Badge>
                        </div>
                      </div>

                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full bg-slate-500"
                          style={{ width: `${result.score}%` }}
                          aria-hidden
                        />
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs text-slate-700">
                        <Badge variant={result.roleMatched ? "default" : "outline"}>
                          role: {result.roleMatched ? "match" : "partial/miss"} ({formatBreakdown(result.breakdown.role)})
                        </Badge>
                        <Badge variant={result.experienceMatched ? "default" : "outline"}>
                          experience: {result.experienceMatched ? "match" : "partial/miss"} (
                          {formatBreakdown(result.breakdown.experience)})
                        </Badge>
                        <Badge variant="outline">skills: {formatBreakdown(result.breakdown.skills)}</Badge>
                        <Badge variant="outline">keywords: {formatBreakdown(result.breakdown.keywords)}</Badge>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-600">Matched tags</p>
                        <div className="flex flex-wrap gap-2">
                          {result.matchedKeywords.length === 0 && result.matchedSkills.length === 0 ? (
                            <Badge variant="outline">No term matches</Badge>
                          ) : (
                            <>
                              {result.matchedSkills.map((skill) => (
                                <Badge key={`${result.resumeId}-skill-${skill}`} variant="outline">
                                  skill: {skill}
                                </Badge>
                              ))}
                              {result.matchedKeywords.map((keyword) => (
                                <Badge key={`${result.resumeId}-keyword-${keyword}`} variant="outline">
                                  keyword: {keyword}
                                </Badge>
                              ))}
                            </>
                          )}
                        </div>
                      </div>

                      {(result.missingSkills.length > 0 || result.missingKeywords.length > 0) && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-600">Missing tags</p>
                          <div className="flex flex-wrap gap-2">
                            {result.missingSkills.map((skill) => (
                              <Badge key={`${result.resumeId}-missing-skill-${skill}`} variant="destructive">
                                missing skill: {skill}
                              </Badge>
                            ))}
                            {result.missingKeywords.map((keyword) => (
                              <Badge key={`${result.resumeId}-missing-keyword-${keyword}`} variant="destructive">
                                missing keyword: {keyword}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <Separator />
                    </article>
                  ))}
                </div>
              )}
            </section>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
