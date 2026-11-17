import { useMemo, useState } from 'react';
import {
  Download,
  MessageSquare,
  Pencil,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { formatPhoneDisplay } from '../blueprintConstraints';
import type { CongregantRecord, Gender } from '../types';
import { ConfirmModal } from './ConfirmModal';

interface CongregantsViewProps {
  congregants: CongregantRecord[];
  loading: boolean;
  onAdd: () => void;
  onEdit: (record: CongregantRecord) => void;
  onDelete: (id: string) => Promise<void>;
  onSendSmsToSelected: (selectedIds: string[]) => void;
}

type GenderFilter = 'All' | Gender;

export function CongregantsView({
  congregants,
  loading,
  onAdd,
  onEdit,
  onDelete,
  onSendSmsToSelected,
}: CongregantsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('All');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<CongregantRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return congregants.filter((item) => {
      if (genderFilter !== 'All' && item.gender !== genderFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.phoneNumber.toLowerCase().includes(q) ||
        formatPhoneDisplay(item.phoneNumber).toLowerCase().includes(q)
      );
    });
  }, [congregants, genderFilter, searchQuery]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const next = new Set(selectedIds);
      for (const item of filtered) next.delete(item.id);
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      for (const item of filtered) next.add(item.id);
      setSelectedIds(next);
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await onDelete(deleteTarget.id);
      const next = new Set(selectedIds);
      next.delete(deleteTarget.id);
      setSelectedIds(next);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleExportCsv = () => {
    const rows = [
      ['Name', 'Gender', 'Phone Number'],
      ...filtered.map((c) => [
        `"${c.name.replace(/"/g, '""')}"`,
        c.gender,
        c.phoneNumber,
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'jcc-sondu-congregants.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name or phone number..."
              aria-label="Search congregants"
              className="w-full pl-9 pr-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#123c69]/20 focus:border-[#123c69]"
            />
          </div>

          <div
            className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start"
            role="group"
            aria-label="Filter by gender"
          >
            {(['All', 'Male', 'Female', 'Other'] as GenderFilter[]).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setGenderFilter(opt)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  genderFilter === opt
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={() => onSendSmsToSelected(Array.from(selectedIds))}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-[#d49a2a] rounded-lg hover:bg-[#b9821e] transition-colors cursor-pointer whitespace-nowrap"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="tabular-nums">Message Selected ({selectedCount})</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-[#123c69] rounded-lg hover:bg-[#092b4c] transition-colors cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add Congregant</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-2.5">
            {[1, 2, 3, 4, 5].map((idx) => (
              <div key={idx} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : congregants.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <h3 className="text-base font-semibold text-slate-900 mb-1.5">
              No congregants in the directory
            </h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto mb-5">
              Store congregants’ full names, gender, and phone numbers so admins can update records and dispatch mass SMS announcements.
            </p>
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#123c69] rounded-lg hover:bg-[#092b4c] transition-colors cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              Add First Congregant
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <p className="text-sm font-medium text-slate-800 mb-1">
              No matching congregants found
            </p>
            <p className="text-xs text-slate-500 mb-4">
              Try clearing your search query or switching the gender filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setGenderFilter('All');
              }}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 pl-5 pr-2 w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all visible congregants"
                      className="w-4 h-4 rounded border-slate-300 text-[#123c69] focus:ring-[#123c69] cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4">Full Name</th>
                  <th className="py-3 px-4">Gender</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4 hidden sm:table-cell">Added</th>
                  <th className="py-3 pr-5 pl-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((person) => {
                  const isChecked = selectedIds.has(person.id);
                  const createdDate = person.createdAt
                    ? person.createdAt.toDate().toLocaleDateString('en-KE', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : 'Saving...';

                  return (
                    <tr
                      key={person.id}
                      className={`transition-colors ${
                        isChecked ? 'bg-[#123c69]/[0.03]' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-2.5 pl-5 pr-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleOne(person.id)}
                          aria-label={`Select ${person.name}`}
                          className="w-4 h-4 rounded border-slate-300 text-[#123c69] focus:ring-[#123c69] cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        {person.name}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{person.gender}</td>
                      <td className="py-2.5 px-4 font-mono-tabular text-slate-800 whitespace-nowrap">
                        {formatPhoneDisplay(person.phoneNumber)}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-500 tabular-nums hidden sm:table-cell whitespace-nowrap">
                        {createdDate}
                      </td>
                      <td className="py-2.5 pr-5 pl-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onEdit(person)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 hover:text-[#123c69] transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(person)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-white border border-slate-200 rounded-md hover:bg-red-50 hover:border-red-200 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Erase</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Erase Congregant Record"
        description={
          deleteTarget
            ? `Permanently erase ${deleteTarget.name} (${formatPhoneDisplay(
                deleteTarget.phoneNumber
              )}) from the JCC Sondu congregant directory? This action cannot be undone.`
            : ''
        }
        confirmLabel="Erase Congregant"
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}
