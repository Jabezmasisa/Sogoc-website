import {
  ArrowLeft,
  ClipboardCheck,
  History,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Phone,
  Users,
  X,
} from 'lucide-react';
import type { AdminNavSection } from '../types';

interface SidebarProps {
  activeSection: AdminNavSection;
  onSelect: (section: AdminNavSection) => void;
  onSignOut: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  pendingRegistrationCount: number;
  congregantCount: number;
  adminNumberCount: number;
}

const NAV_ITEMS: Array<{
  id: AdminNavSection;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'registrations', label: 'Registrations', icon: ClipboardCheck },
  { id: 'congregants', label: 'Congregants', icon: Users },
  { id: 'mass-sms', label: 'Mass SMS', icon: MessageSquare },
  { id: 'admin-numbers', label: 'Admin Numbers', icon: Phone },
  { id: 'campaigns', label: 'Campaign History', icon: History },
];

export function Sidebar({
  activeSection,
  onSelect,
  onSignOut,
  mobileOpen,
  onCloseMobile,
  pendingRegistrationCount,
  congregantCount,
  adminNumberCount,
}: SidebarProps) {
  const getCount = (id: AdminNavSection): number | null => {
    if (id === 'registrations') return pendingRegistrationCount;
    if (id === 'congregants') return congregantCount;
    if (id === 'admin-numbers') return adminNumberCount;
    return null;
  };

  const navContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-64">
      <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 shrink-0">
        <a
          href="/admin"
          className="text-base font-bold tracking-tight text-[#123c69] whitespace-nowrap shrink-0"
        >
          JCC Sondu Admin
        </a>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation"
          className="lg:hidden p-2 text-slate-500 hover:text-slate-900 rounded-md cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Admin navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          const count = getCount(item.id);
          const isPendingAlert = item.id === 'registrations' && (count ?? 0) > 0;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelect(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-[#123c69] text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </span>
              {count !== null && (
                <span
                  className={`font-mono-tabular text-xs shrink-0 ${
                    isPendingAlert && !isActive
                      ? 'px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold'
                      : isActive
                      ? 'text-slate-200'
                      : 'text-slate-500'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200 space-y-1 shrink-0">
        <a
          href="/"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors whitespace-nowrap"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          <span>Public Website</span>
        </a>
        <button
          type="button"
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-red-700 transition-colors cursor-pointer whitespace-nowrap"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{navContent}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{navContent}</div>
        </div>
      )}
    </>
  );
}
