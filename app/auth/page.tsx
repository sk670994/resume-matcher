"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      if (mode === "sign-up") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Check your email for confirmation (if enabled).");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // redirect to dashboard on success
        router.push("/dashboard");
      }
    } catch (err: any) {
      setMessage(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl">
      <section className="rounded-lg border p-6">
        <h1 className="mb-4 text-2xl font-semibold">{mode === "sign-in" ? "Sign In" : "Sign Up"}</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {message && <p className="text-sm text-red-600">{message}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {mode === "sign-in" ? "Sign In" : "Create Account"}
          </Button>
          <Button variant="ghost" type="button" onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in") }>
            {mode === "sign-in" ? "Switch to Sign Up" : "Switch to Sign In"}
          </Button>
        </div>
        </form>
      </section>
    </main>
  );
}
