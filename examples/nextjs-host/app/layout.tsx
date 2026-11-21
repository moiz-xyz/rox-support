export const metadata = { title: "Acme Store — Rox Support example" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fafafa", color: "#18181b" }}>{children}</body>
    </html>
  );
}
