import { createHmac } from "crypto";

/**
 * Server-side helper for integrating applications (Node.js / Next.js route handlers only).
 * NEVER import this into browser code — it needs the application secret.
 *
 *   import { createCustomerToken } from "@roxshield/support-sdk/server";
 *   const token = createCustomerToken({ appSecret: process.env.ROX_SUPPORT_APP_SECRET!, customer: { id: user.id, name: user.name } });
 */
export interface CustomerIdentity {
  /** Stable id of the customer in your system. */
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  /** Shown to agents in the customer panel (plan, order count, …). Keep it small. */
  metadata?: Record<string, string | number | boolean | null>;
}

export interface CreateCustomerTokenOptions {
  appSecret: string;
  customer: CustomerIdentity;
  /** Lifetime in seconds (default 300, the backend rejects anything above 3600). */
  expiresInSec?: number;
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

export function createCustomerToken({ appSecret, customer, expiresInSec = 300 }: CreateCustomerTokenOptions): string {
  if (!appSecret || !appSecret.startsWith("rsk_")) throw new Error("A Rox Support application secret (rsk_…) is required");
  if (!customer?.id) throw new Error("customer.id is required");
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: String(customer.id),
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      avatarUrl: customer.avatarUrl,
      metadata: customer.metadata,
      iat,
      exp: iat + Math.min(Math.max(expiresInSec, 30), 3600),
    })
  );
  const signature = createHmac("sha256", appSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
