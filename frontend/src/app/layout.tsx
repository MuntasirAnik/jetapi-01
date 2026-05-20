import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'JetAPI',
  description: 'A premium API client built with Next.js and NestJS',
};
import dynamic from 'next/dynamic';
import ToastProvider from '@/components/ToastProvider';
import ThemeToggle from '@/components/ThemeToggle';
import { DialogProvider } from '@/components/DialogProvider';
import { AppProvider } from '@/lib/AppContext';
import GlobalTopBar from '@/components/GlobalTopBar';
const AnnouncementTicker = dynamic(() => import('@/components/AnnouncementTicker'));
const FooterTerminal = dynamic(() => import('@/components/FooterTerminal'));
import MaintenanceGuard from '@/components/MaintenanceGuard';
import { FeatureFlagProvider } from '@/lib/FeatureFlagContext';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased bg-[var(--background)] text-[var(--foreground)] h-screen flex flex-col overflow-hidden`}>
        <AppProvider>
          <FeatureFlagProvider>
          <DialogProvider>
            <ToastProvider />
            <MaintenanceGuard>
              {/* min-h-12 reserves TopBar space to prevent CLS */}
              <div className="shrink-0 min-h-12">
                <GlobalTopBar />
              </div>
              <AnnouncementTicker />
              <main className="flex-1 flex overflow-hidden">
                {children}
              </main>
              {/* min-h reserves space for the footer bar to prevent CLS */}
              <div className="shrink-0 min-h-7">
                <FooterTerminal />
              </div>
            </MaintenanceGuard>
          </DialogProvider>
          </FeatureFlagProvider>
        </AppProvider>
      </body>
    </html>
  );
}
