import { cookies } from "next/headers";

/** Demo-only "login": stores a fake user in an httpOnly cookie. */
export async function POST(req: Request) {
  const form = await req.formData();
  const name = String(form.get("name") || "").trim().slice(0, 60);
  const store = await cookies();
  if (!name) {
    store.delete("demo_user");
  } else {
    const id = `demo_${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    store.set("demo_user", JSON.stringify({ id, name, email: `${id}@example.com` }), { httpOnly: true, sameSite: "lax", path: "/" });
  }
  return Response.redirect(new URL("/", req.url), 303);
}
