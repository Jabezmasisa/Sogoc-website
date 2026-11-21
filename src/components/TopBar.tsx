import { Menu, MessageSquare, UserPlus } from 'lucide-react';
import type { AdminNavSection } from '../types';

interface TopBarProps {
  activeSection: AdminNavSection;
  adminEmail: string;
  onOpenMobileMenu: () => void;
  onOpenAddCongregant: () => void;
  onGoToMassSms: () => void;
}

const SECTION_TITLES: Record<AdminNavSection, string> = {
  overview: 'Overview',
  registrations: 'Registrations & Auto-SMS',
  congregants: 'Congregants',
  'mass-sms': 'Mass SMS',
  'admin-numbers': 'Admin Numbers',
  campaigns: 'Campaign History',
};

export function TopBar({
  activeSection,
  adminEmail,
  onOpenMobileMenu,
  onOpenAddCongregant,
  onGoToMassSms,
}: TopBarProps) {
  const showSmsPrimary = activeSection === 'overview' || activeSection === 'campaigns';

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-md cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-slate-500 whitespace-nowrap hidden sm:inline">
            Admin Portal
          </span>
          <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
            /
          </span>
          <h1 className="text-base font-semibold text-slate-900 truncate">
            {SECTION_TITLES[activeSection]}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <span className="hidden md:inline text-xs text-slate-500 truncate max-w-[220px]">
          {adminEmail}
        </span>
        {activeSection !== 'mass-sms' &&
          (showSmsPrimary ? (
            <button
              type="button"
              onClick={onGoToMassSms}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#123c69] rounded-lg hover:bg-[#092b4c] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span>Compose SMS</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAddCongregant}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#123c69] rounded-lg hover:bg-[#092b4c] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <UserPlus className="w-4 h-4 shrink-0" />
              <span>Add Congregant</span>
            </button>
          ))}
      </div>
    </header>
  );
}
