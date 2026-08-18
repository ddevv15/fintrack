import { createBrowserClient } from "@insforge/sdk/ssr";

/**
 * The InsForge client for Client Components and browser only modules.
 *
 * Its auth surface is read only on purpose. Anything that starts or ends a
 * session runs on the server through createAuthActions, so the refresh token
 * stays httpOnly and no script can read it.
 */
export const insforge = createBrowserClient();
