import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'JetAPI',
  description: 'A premium API client built with Next.js and NestJS',
};
import ToastProvider from '@/components/ToastProvider';
import ThemeToggle from '@/components/ThemeToggle';
import { DialogProvider } from '@/components/DialogProvider';
import { AppProvider } from '@/lib/AppContext';
import GlobalTopBar from '@/components/GlobalTopBar';
import FooterTerminal from '@/components/FooterTerminal';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased bg-[var(--background)] text-[var(--foreground)] h-screen flex flex-col overflow-hidden`}>
        <AppProvider>
          <DialogProvider>
            <ToastProvider />
            <GlobalTopBar />
            <main className="flex-1 flex overflow-hidden">
              {children}
            </main>
            <FooterTerminal />
          </DialogProvider>
        </AppProvider>
      </body>
    </html>
  );
}
