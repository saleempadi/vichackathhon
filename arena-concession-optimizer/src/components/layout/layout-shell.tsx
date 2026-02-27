'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isFanPage = pathname.startsWith('/fan');

  if (isFanPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 bg-slate-50 overflow-auto">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
