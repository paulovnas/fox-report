import type { ReactNode } from 'react';

export const metadata = { title: 'Fox Report — exemplo Next.js' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 24 }}>{children}</body>
    </html>
  );
}
