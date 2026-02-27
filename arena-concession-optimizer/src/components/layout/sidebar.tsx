'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Overview', icon: '📊' },
  { href: '/locations', label: 'Locations', icon: '📍' },
  { href: '/gameday', label: 'Game Day', icon: '🏒' },
  { href: '/simulate', label: 'Simulation', icon: '⏱️' },
  { href: '/predictions', label: 'Predictions', icon: '🔮' },
  { href: '/insights', label: 'AI Insights', icon: '🤖' },
  { href: '/fan', label: 'Fan Finder', icon: '📱' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-900 text-white min-h-screen flex flex-col">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold">Arena Concession</h1>
        <p className="text-sm text-slate-400 mt-1">Victoria Royals</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
              pathname === item.href
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            )}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-700 text-xs text-slate-500">
        Save-On-Foods Memorial Centre
      </div>
    </aside>
  );
}
