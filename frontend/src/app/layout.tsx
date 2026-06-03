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
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var t = localStorage.getItem('app-theme') || 'dark';
              document.documentElement.setAttribute('data-theme', t);
              var fc = localStorage.getItem('app-font-color-custom');
              var fp = localStorage.getItem('app-font-color');
              if (fc) {
                document.documentElement.style.setProperty('--foreground', fc);
              } else if (fp && fp !== 'default') {
                var presets = {white:'#ffffff',snow:'#ededed',silver:'#c0c0c0',stone:'#a8a29e',slate:'#94a3b8',zinc:'#71717a',gray:'#6b7280',dark:'#374151',black:'#1a1a1a'};
                if (presets[fp]) document.documentElement.style.setProperty('--foreground', presets[fp]);
              }
              var a = localStorage.getItem('app-accent');
              if (a) {
                var accents = {orange:['#ff6c37','#e85d2b'],blue:['#3b82f6','#2563eb'],indigo:['#6366f1','#4f46e5'],violet:['#8b5cf6','#7c3aed'],pink:['#ec4899','#db2777'],red:['#ef4444','#dc2626'],emerald:['#10b981','#059669'],teal:['#14b8a6','#0d9488'],cyan:['#06b6d4','#0891b2'],amber:['#f59e0b','#d97706']};
                if (accents[a]) {
                  document.documentElement.style.setProperty('--color-brand-500', accents[a][0]);
                  document.documentElement.style.setProperty('--color-brand-600', accents[a][1]);
                }
              }
            } catch(e) {}
          })();
        `}} />
      </head>
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
