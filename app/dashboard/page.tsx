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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resumes, setResumes] = useState<any[]>([]);

  // ✅ FIXED SESSION CHECK
  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const response = await supabase.auth.getSession();

      if (!mounted) return;

      const session = response.data.session;

      if (!session) {
        router.replace("/auth");
      } else {
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

  // ✅ FETCH RESUMES
  async function fetchResumes(currentUser: any) {
    if (!currentUser) return;

    const { data, error } = await supabase
      .from("resumes")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("uploaded_at", { ascending: false });

    if (error) {
      console.warn("Failed to fetch resumes", error);
      return;
    }

    setResumes(data || []);
  }

  // ✅ HANDLE UPLOAD
  async function handleUpload() {
    setMessage(null);

    if (!selectedFile) {
      setMessage("Select a file to upload");
      return;
    }

    if (!user) {
      setMessage("Not authenticated");
      return;
    }

    setUploading(true);

    try {
      const filePath = `user_${user.id}/${Date.now()}_${selectedFile.name}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(filePath, selectedFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

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

      if (insertError) throw insertError;

      setMessage("Upload successful");

      setSelectedFile(null);

      fetchResumes(user);

    } catch (err: any) {
      setMessage(err?.message || String(err));
    } finally {
      setUploading(false);
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
              accept=".pdf,.doc,.docx"
              onChange={(e) =>
                setSelectedFile(e.target.files?.[0] || null)
              }
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

            {resumes.length === 0 ? (

              <p>No resumes uploaded yet.</p>

            ) : (

              <ul className="space-y-2">

                {resumes.map((r) => (

                  <li
                    key={r.id}
                    className="flex justify-between"
                  >

                    <div>

                      <div className="font-medium">
                        {r.file_name}
                      </div>

                      <div className="text-xs">

                        {new Date(
                          r.uploaded_at
                        ).toLocaleString()}

                      </div>

                    </div>


                    <a
                      href={
                        supabase.storage
                          .from("resumes")
                          .getPublicUrl(r.path)
                          .data.publicUrl
                      }
                      target="_blank"
                    >
                      View
                    </a>

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
