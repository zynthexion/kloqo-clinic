import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"
import { Sidebar } from '@/components/layout/sidebar';

export const metadata: Metadata = {
  title: 'Kloqo',
  description: 'AI-powered medical dashboard.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full bg-background">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Orbitron:wght@400..900&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased h-full">
          <div className="flex h-full">
            <Sidebar />
            <div className="flex-1 flex flex-col h-full overflow-y-auto">
              {children}
            </div>
          </div>
          <Toaster />
      </body>
    </html>
  );
}
