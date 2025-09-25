import { Sidebar } from '@/components/layout/sidebar';
import { TopNav } from '@/components/layout/top-nav';


export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex-1 flex flex-col h-full overflow-y-auto">
        <TopNav />
        {children}
      </div>
    </div>
  );
}
