import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GitJudge',
  description: 'GenLayer-powered PR bounty judge',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
