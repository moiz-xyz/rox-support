"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Headphones, Lock, Mail } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { getClient } from "@/lib/support";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (getClient().isAuthenticated) router.replace("/inbox/mine");
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await getClient().login(email, password);
      router.replace("/inbox/mine");
    } catch (err: any) {
      setError(err?.message || "Login failed");
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="mb-8 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Headphones className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Rox Support</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to your workspace</h1>
          <p className="mt-1.5 text-sm text-zinc-500">Agents and administrators only. First sign-in? Use your Rox Shield super-admin credentials.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">Email</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" placeholder="you@roxanlabs.com" />
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">Password</span>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9" placeholder="••••••••" />
              </div>
            </label>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 ring-inset" role="alert">{error}</p>}
            <Button type="submit" variant="primary" className="w-full justify-center" loading={loading}>
              Sign in
            </Button>
          </form>
        </div>
      </section>
      <section className="relative hidden overflow-hidden bg-zinc-950 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_70%_20%,rgba(99,102,241,0.35),transparent)]" />
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <div className="mb-10 max-w-md space-y-3">
            {[
              ["Ayesha K.", "My device shows a lock screen after payment."],
              ["Support · Hamza", "Thanks — I've re-synced it. Could you restart the phone?"],
              ["Ayesha K.", "Working now 🎉"],
            ].map(([who, text], i) => (
              <div key={i} className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${i === 1 ? "ml-auto bg-brand-600" : "bg-white/10 backdrop-blur"}`}>
                <div className="text-[11px] opacity-60">{who}</div>
                {text}
              </div>
            ))}
          </div>
          <h2 className="text-3xl font-semibold tracking-tight">Every customer conversation, in one place.</h2>
          <p className="mt-3 max-w-md text-zinc-400">Real-time chat, file sharing and voice calls from every Rox Shield app — handled by your team from a single inbox.</p>
        </div>
      </section>
    </main>
  );
}
