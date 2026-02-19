"use client";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// If env vars are missing, provide a lightweight no-op fallback so the app
// doesn't crash during development. Encourage configuring `.env.local`.
if (!supabaseUrl || !supabaseAnonKey) {
	// eslint-disable-next-line no-console
	console.warn(
		"Supabase env vars not found. Create a .env.local with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable auth/storage."
	);
}

export const supabase: any = supabaseUrl && supabaseAnonKey
	? createClient(supabaseUrl, supabaseAnonKey)
	: {
			auth: {
				getSession: async () => ({ data: { session: null } }),
				onAuthStateChange: () => ({ subscription: { unsubscribe: () => {} } }),
				signOut: async () => ({ error: null }),
				signInWithPassword: async () => ({ error: new Error("Supabase not configured") }),
				signUp: async () => ({ error: new Error("Supabase not configured") }),
			},
			storage: {
				from: () => ({
					upload: async () => ({ error: new Error("Supabase not configured") }),
					createSignedUrl: async () => ({ error: new Error("Supabase not configured") }),
					download: async () => ({ error: new Error("Supabase not configured") }),
				}),
			},
		};
