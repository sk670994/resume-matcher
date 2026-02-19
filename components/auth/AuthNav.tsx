"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AuthNav() {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
    });

    const { subscription } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    // full reload to clear client state
    window.location.href = "/";
  }

  if (session) {
    return (
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="text-sm">
          Dashboard
        </Link>
        <button onClick={handleSignOut} className="text-sm text-destructive">
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <Link href="/auth" className="text-sm">
        Sign In
      </Link>
    </div>
  );
}
