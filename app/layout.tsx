import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'GitJudge',
  description: 'GenLayer-powered GitHub PR judge',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background:
            'radial-gradient(circle at top, #111827 0%, #020617 55%, #000000 100%)',
          color: '#e5e7eb',
          fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
