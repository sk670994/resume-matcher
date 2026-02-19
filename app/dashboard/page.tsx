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

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (!data.session) {
        router.replace("/auth");
      } else {
        setUser(data.session.user);
        setLoading(false);
        // fetch user's resumes
        fetchResumes(data.session.user);
      }
    });
    return () => {
      mounted = false;
    };
  }, [router]);

  async function fetchResumes(currentUser: any) {
    if (!currentUser) return;
    const { data, error } = await supabase
      .from("resumes")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("uploaded_at", { ascending: false });
    if (error) {
      // non-blocking
      console.warn("Failed to fetch resumes", error);
      return;
    }
    setResumes(data || []);
  }

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
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(filePath, selectedFile, { cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;

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

  if (loading) return <div className="p-6">Checking session…</div>;

  return (
    <main className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Resume Matcher Dashboard</h1>
          <p className="text-sm text-muted-foreground">Upload resumes, define requirements, and view ranked matches.</p>
        </div>
        <Badge variant="secondary">Scaffold</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Resume Upload</CardTitle>
            <CardDescription>Upload PDF or DOCX resumes to Supabase Storage.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="file"
              accept=".pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
            <Button className="w-full" onClick={handleUpload} disabled={uploading}>
              {uploading ? "Uploading…" : "Upload Resume"}
            </Button>
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Uploaded Resumes</CardTitle>
            <CardDescription>Stored resume files and metadata will appear here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {resumes.length === 0 ? (
              <>
                <p>No resumes uploaded yet.</p>
                <Separator />
                <p>Example: john_resume.pdf</p>
              </>
            ) : (
              <ul className="space-y-2">
                {resumes.map((r) => (
                  <li key={r.id} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{r.file_name}</div>
                      <div className="text-xs text-muted-foreground">{new Date(r.uploaded_at).toLocaleString()}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={supabase.storage.from("resumes").getPublicUrl(r.path).data.publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm"
                      >
                        View
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Job Requirements</CardTitle>
            <CardDescription>Enter requirements for matching.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Input id="role" placeholder="Frontend Developer" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="skills">Skills</Label>
              <Input id="skills" placeholder="React, Node.js, TypeScript" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="experience">Experience</Label>
              <Input id="experience" placeholder="3+ years" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="keywords">Keywords</Label>
              <Textarea id="keywords" placeholder="performance optimization, REST APIs, CI/CD" />
            </div>
            <Button className="w-full">Run Match</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Matching Results</CardTitle>
            <CardDescription>Ranked resumes with relevance score.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>No matches yet. Submit requirements to see results.</p>
            <Separator />
            <p>Expected fields: file name, match %, matched keywords, view/download action.</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

