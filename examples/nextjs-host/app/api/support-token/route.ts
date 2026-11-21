import { cookies } from "next/headers";
import { createCustomerToken } from "@roxshield/support-sdk/server";

/**
 * Mints a short-lived Rox Support identity token for the signed-in user.
 * This is the ONLY place the application secret is used — it never reaches the browser.
 * Replace the demo cookie lookup with your real session (NextAuth, Clerk, your own JWT, …).
 */
export async function GET() {
  const raw = (await cookies()).get("demo_user")?.value;
  if (!raw) return new Response("", { status: 204 }); // not signed in → anonymous visitor (if allowed)
  const user = JSON.parse(raw) as { id: string; name: string; email: string };

  const token = createCustomerToken({
    appSecret: process.env.ROX_SUPPORT_APP_SECRET!,
    customer: {
      id: user.id,
      name: user.name,
      email: user.email,
      metadata: { plan: "Pro", signedUpVia: "example-app" },
    },
    expiresInSec: 300,
  });
  return new Response(token, { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
}
