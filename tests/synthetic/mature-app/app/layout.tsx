import type { ReactNode } from "react";

export const metadata = {
  title: "Acme Docs",
  description: "Summarize and manage your documents.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
