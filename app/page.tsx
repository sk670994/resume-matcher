import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Resume Matcher",
  description: "Upload resumes and match them against job requirements",
};

export default function HomePage() {
  return (
    <main className="container mx-auto flex min-h-screen max-w-5xl items-center px-4 py-10">
      <Card className="w-full border-slate-200">
        <CardHeader>
          <CardTitle className="text-3xl">Resume Matcher</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/auth">Go to Auth</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Open Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

