import { createRefreshAuthRouter } from "@insforge/sdk/ssr";

/**
 * The browser client calls this when its short lived access token is missing,
 * expired, or rejected. The refresh token never leaves the server.
 */
export const { POST } = createRefreshAuthRouter();
