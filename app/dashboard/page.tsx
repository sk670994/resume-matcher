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
import { supabase } from "@/lib/supabaseClient";

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resumes, setResumes] = useState<any[]>([]);
  const [bucketExists, setBucketExists] = useState<boolean | null>(null);
  const [creatingBucket, setCreatingBucket] = useState(false);

  // ✅ FIXED SESSION CHECK
  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const response = await supabase.auth.getSession();

      if (!mounted) return;

      const session = response.data.session;

      if (!session) {
        console.log("No session found, redirecting to /auth");
        router.replace("/auth");
      } else {
        console.log("Session found for user", session.user?.id);
        setSession(session);
        setUser(session.user);
        setLoading(false);
        fetchResumes(session.user);
      }
    };

    checkSession();

    return () => {
      mounted = false;
    };
  }, [router]);

  // Check whether the 'resumes' bucket exists (preflight)
  const checkBucketExists = async () => {
    try {
      const { data, error } = await supabase.storage.from("resumes").list("", { limit: 1 });
      if (error) {
        setBucketExists(false);
      } else {
        setBucketExists(true);
      }
    } catch (err) {
      setBucketExists(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    if (mounted) {
      checkBucketExists();
    }
    return () => {
      mounted = false;
    };
  }, []);

  // ✅ FETCH RESUMES
  async function fetchResumes(currentUser: any) {
    if (!currentUser) return;

    const { data, error } = await supabase
      .from("resumes")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("uploaded_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch resumes", error);
      return;
    }

    console.log("Fetched resumes:", data);
    setResumes(data || []);
  }

  // Poll resumes every 10s to pick up status updates done server-side
  useEffect(() => {
    let mounted = true;
    if (!user) return;
    const id = setInterval(() => {
      if (!mounted) return;
      fetchResumes(user);
    }, 10000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [user]);

  // ✅ HANDLE UPLOAD
  async function handleUpload() {
    setMessage(null);

    if (!selectedFile) {
      setMessage("Select a file to upload");
      return;
    }

    // Enforce PDF-only uploads client-side
    const isPdfByType = selectedFile.type === "application/pdf";
    const isPdfByName = selectedFile.name.toLowerCase().endsWith(".pdf");
    if (!isPdfByType && !isPdfByName) {
      console.warn("handleUpload: rejected non-pdf file", selectedFile.type, selectedFile.name);
      setMessage("Only PDF files are allowed. Please upload a .pdf file.");
      return;
    }

    if (!user) {
      setMessage("Not authenticated");
      return;
    }

    setUploading(true);

    try {
      console.log("handleUpload: starting upload", { fileName: selectedFile.name, userId: user.id });
      const filePath = `user_${user.id}/${Date.now()}_${selectedFile.name}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(filePath, selectedFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error("handleUpload: uploadError", uploadError);
        throw uploadError;
      }

      // Insert metadata
      const { error: insertError } = await supabase.from("resumes").insert([
        {
          user_id: user.id,
          file_name: selectedFile.name,
          path: filePath,
          content_type: selectedFile.type,
          size: selectedFile.size,
        },
      ]);

      if (insertError) {
        console.error("handleUpload: insertError", insertError);
        throw insertError;
      }

      setMessage("Upload successful");

      setSelectedFile(null);

      fetchResumes(user);

    } catch (err: any) {
      console.error("handleUpload: caught error", err);
      setMessage(err?.message || String(err));
    } finally {
      setUploading(false);
    }
  }

  async function getSignedUrl(path: string) {
    if (!session?.access_token) return null;
    try {
      console.log("getSignedUrl: requesting signed url for", path);
      const res = await fetch("/api/signed-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ path }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("getSignedUrl: server responded with error", data);
        return null;
      }
      console.log("getSignedUrl: received signed url");
      return data.signedUrl || null;
    } catch (err) {
      console.error("getSignedUrl: failed", err);
      return null;
    }
  }

  async function handleView(path: string) {
    const signed = await getSignedUrl(path);
    if (signed) {
      console.log("handleView: opening signed url");
      window.open(signed, "_blank");
      return;
    }
    // fallback to public url
    console.warn("handleView: signed url not available, trying public url");
    const publicUrl = supabase.storage.from("resumes").getPublicUrl(path).data.publicUrl;
    if (publicUrl) {
      console.log("handleView: opening public url");
      window.open(publicUrl, "_blank");
    } else {
      console.error("handleView: unable to get any url for", path);
      setMessage("Unable to get file URL");
    }
  }

  // ✅ LOADING STATE
  if (loading) {
    return <div className="p-6">Checking session...</div>;
  }

  return (
    <main className="container mx-auto max-w-6xl px-4 py-8">

      {/* HEADER */}
      <div className="mb-8 flex items-center justify-between">

        <div>

          <h1 className="text-3xl font-semibold tracking-tight">
            Resume Matcher Dashboard
          </h1>

          <p className="text-sm text-muted-foreground">
            Upload resumes, define requirements, and view ranked matches.
          </p>

        </div>

        <Badge variant="secondary">Scaffold</Badge>

      </div>


      <div className="grid gap-6 md:grid-cols-2">

        {/* UPLOAD CARD */}
        <Card>

          <CardHeader>

            <CardTitle>Resume Upload</CardTitle>

            <CardDescription>
              Upload PDF or DOCX resumes to Supabase Storage.
            </CardDescription>

          </CardHeader>

          <CardContent className="space-y-3">

            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />

            <Button
              className="w-full"
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? "Uploading..." : "Upload Resume"}
            </Button>

            {message && (
              <p className="text-sm text-muted-foreground">
                {message}
              </p>
            )}

            {bucketExists === false && (
              <div className="text-sm text-red-600 mt-2">
                <p>Bucket not found. Create a private `resumes` bucket in your Supabase project.</p>
                <div className="mt-2 flex gap-2">
                  <a
                    href={
                      (() => {
                        try {
                          const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
                          const projectRef = new URL(url).hostname.split(".")[0];
                          return `https://app.supabase.com/project/${projectRef}/storage/buckets`;
                        } catch (e) {
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
                  <a
                    href="/supabase/migrations/001_create_resumes_table.sql"
                    className="underline"
                  >
                    View migration
                  </a>
                  {process.env.SUPABASE_SERVICE_ROLE_KEY && (
                    <button
                      onClick={async () => {
                        setCreatingBucket(true);
                        setMessage(null);
                        try {
                          const res = await fetch("/api/admin/create-bucket", { method: "POST" });
                          const json = await res.json();
                          if (res.ok && json.ok) {
                            setMessage("Bucket created — run migrations next.");
                            // re-check bucket
                            await checkBucketExists();
                          } else {
                            setMessage(json.error || "Failed to create bucket");
                          }
                        } catch (err: any) {
                          setMessage(err?.message || String(err));
                        } finally {
                          setCreatingBucket(false);
                        }
                      }}
                      className="ml-2 underline"
                      disabled={creatingBucket}
                    >
                      {creatingBucket ? "Creating…" : "Create bucket (server)"}
                    </button>
                  )}
                </div>
              </div>
            )}

          </CardContent>

        </Card>


        {/* RESUME LIST */}
        <Card>

          <CardHeader>

            <CardTitle>Uploaded Resumes</CardTitle>

            <CardDescription>
              Stored resume files and metadata
            </CardDescription>

          </CardHeader>

          <CardContent>

            {resumes.filter((r) => r.status === "uploaded").length === 0 ? (

              <p>No pending uploads.</p>

            ) : (

              <ul className="space-y-2">

                {resumes
                  .filter((r) => r.status === "uploaded")
                  .map((r) => (

                    <li key={r.id} className="flex justify-between">

                      <div>

                        <div className="font-medium">{r.file_name}</div>

                        <div className="text-xs">{new Date(r.uploaded_at).toLocaleString()}</div>

                      </div>

                      <button onClick={() => handleView(r.path)} className="text-sm text-blue-600">
                        View
                      </button>

                    </li>

                  ))}

              </ul>

            )}

          </CardContent>

        </Card>


        {/* REQUIREMENTS */}
        <Card>

          <CardHeader>

            <CardTitle>Job Requirements</CardTitle>

          </CardHeader>

          <CardContent className="space-y-3">

            <Input placeholder="Role" />

            <Input placeholder="Skills" />

            <Input placeholder="Experience" />

            <Textarea placeholder="Keywords" />

            <Button className="w-full">

              Run Match

            </Button>

          </CardContent>

        </Card>


        {/* RESULTS */}
        <Card>

          <CardHeader>

            <CardTitle>Matching Results</CardTitle>

          </CardHeader>

          <CardContent>

            No results yet.

          </CardContent>

        </Card>

      </div>

    </main>
  );
}
