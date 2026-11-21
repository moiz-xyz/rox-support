import { cookies } from "next/headers";
import { SupportLauncher } from "./SupportLauncher";

export default async function Home() {
  const raw = (await cookies()).get("demo_user")?.value;
  const user = raw ? (JSON.parse(raw) as { name: string; email: string }) : null;
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "64px 24px" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Acme Store</h1>
      <p style={{ color: "#71717a" }}>An example host application with the Rox Support widget installed.</p>
      <form action="/api/demo-login" method="post" style={{ display: "flex", gap: 8, marginTop: 32 }}>
        <input name="name" placeholder="Sign in as… (leave empty to sign out)" defaultValue={user?.name ?? ""} style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #e4e4e7" }} />
        <button style={{ padding: "10px 16px", borderRadius: 10, border: 0, background: "#18181b", color: "#fff" }}>{user ? "Switch user" : "Sign in"}</button>
      </form>
      <p style={{ fontSize: 14, color: "#71717a" }}>{user ? `Signed in as ${user.name} (${user.email}).` : "Not signed in — the widget runs as an anonymous visitor if the application allows it."}</p>
      <SupportLauncher />
    </main>
  );
}
