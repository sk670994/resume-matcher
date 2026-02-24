"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

export default function AuthNav() {

  const [session, setSession] = useState<any>(null);
useEffect(() => {

  let mounted = true;

  const getSession = async () => {
    const response = await supabase.auth.getSession();
    if (!mounted) return;
    setSession(response.data.session);
  };

  getSession();

  const { data: listener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, sess: Session | null) => {
    setSession(sess);
  });

  return () => {
    mounted = false;
    listener?.subscription?.unsubscribe();
  };

}, []);



  async function handleSignOut() {

    await supabase.auth.signOut();

    window.location.href = "/";

  }



  if (session) {

    return (

      <div className="flex items-center gap-4">

        <Link href="/dashboard" className="text-sm">

          Dashboard

        </Link>

        <button
          onClick={handleSignOut}
          className="text-sm"
        >

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
