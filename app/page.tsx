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
    <main className="mx-auto max-w-4xl py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl">Resume Matcher</CardTitle>
          <CardDescription>Simple resume upload and matching workflow.</CardDescription>
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
