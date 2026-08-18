import { cookies } from "next/headers";
import { createServerClient } from "@insforge/sdk/ssr";

/**
 * The InsForge client for Server Components, Route Handlers, and Server
 * Actions. It reads the access token cookie and sends it as the bearer token
 * for that one request, so row level security decides what the signed in
 * person may see.
 */
export async function createInsforgeServer() {
  return createServerClient({ cookies: await cookies() });
}
