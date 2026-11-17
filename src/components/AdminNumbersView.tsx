import { useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Check,
  Mail,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  ADMIN_EMAIL_CONSTRAINTS,
  ADMIN_NUMBER_CONSTRAINTS,
  BOOTSTRAPPED_ADMIN_EMAILS,
  formatPhoneDisplay,
  isBootstrappedAdminEmail,
  isValidAdminEmailAddress,
  isValidPhoneNumber,
  normalizeEmail,
  normalizePhoneNumber,
} from '../blueprintConstraints';
import {
  createAdminEmail,
  createAdminNumber,
  deleteAdminEmail,
  deleteAdminNumber,
  setDefaultAdminNumber,
  updateAdminNumber,
} from '../services/firestoreService';
import type { AdminEmailRecord, AdminNumberRecord, AdminUserRecord } from '../types';
import { ConfirmModal } from './ConfirmModal';

interface AdminNumbersViewProps {
  user: User;
  adminNumbers: AdminNumberRecord[];
  admins: AdminUserRecord[];
  adminEmails: AdminEmailRecord[];
  loading: boolean;
}

export function AdminNumbersView({
  user,
  adminNumbers,
  admins,
  adminEmails,
  loading,
}: AdminNumbersViewProps) {
  const [label, setLabel] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [makeDefault, setMakeDefault] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminNumberRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [adminEmailInput, setAdminEmailInput] = useState('');
  const [adminNameInput, setAdminNameInput] = useState('');
  const [addingAdminEmail, setAddingAdminEmail] = useState(false);
  const [adminEmailError, setAdminEmailError] = useState<string | null>(null);
  const [adminEmailSuccess, setAdminEmailSuccess] = useState<string | null>(null);
  const [deleteEmailTarget, setDeleteEmailTarget] = useState<AdminEmailRecord | null>(null);
  const [deletingEmail, setDeletingEmail] = useState(false);

  const normalizedPreview = normalizePhoneNumber(phoneInput);
  const currentUserEmail = user.email ? normalizeEmail(user.email) : '';

  const handleAddNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!label.trim()) {
      setError('Enter a label for this admin number (e.g., Pastor Office Line).');
      return;
    }
    if (!isValidPhoneNumber(normalizedPreview)) {
      setError('Enter a valid phone number (e.g., 0722627135 or +254722627135).');
      return;
    }

    setSubmitting(true);
    try {
      await createAdminNumber(
        {
          label: label.trim(),
          phoneNumber: normalizedPreview,
          isDefault: makeDefault,
        },
        user,
        adminNumbers
      );
      setLabel('');
      setPhoneInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save admin number.');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (item: AdminNumberRecord) => {
    setEditingId(item.id);
    setEditLabel(item.label);
    setEditPhone(item.phoneNumber);
  };

  const handleSaveEdit = async (id: string) => {
    setError(null);
    const norm = normalizePhoneNumber(editPhone);
    if (!editLabel.trim() || !isValidPhoneNumber(norm)) {
      setError('Provide a valid label and phone number when editing.');
      return;
    }
    setSavingEdit(true);
    try {
      await updateAdminNumber(id, { label: editLabel.trim(), phoneNumber: norm });
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update admin number.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAdminNumber(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleAddAdminEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminEmailError(null);
    setAdminEmailSuccess(null);

    const normalized = normalizeEmail(adminEmailInput);
    if (!isValidAdminEmailAddress(normalized)) {
      setAdminEmailError('Enter a valid Google email address (e.g., pastor@gmail.com).');
      return;
    }

    setAddingAdminEmail(true);
    try {
      const savedEmail = await createAdminEmail(
        {
          email: normalized,
          displayName: adminNameInput.trim(),
        },
        user
      );
      setAdminEmailInput('');
      setAdminNameInput('');
      setAdminEmailSuccess(`${savedEmail} can now sign in with Google to access the Admin Portal.`);
    } catch (err) {
      setAdminEmailError(
        err instanceof Error ? err.message : 'Unable to authorize Google email.'
      );
    } finally {
      setAddingAdminEmail(false);
    }
  };

  const handleConfirmDeleteEmail = async () => {
    if (!deleteEmailTarget) return;
    setDeletingEmail(true);
    try {
      await deleteAdminEmail(deleteEmailTarget.id);
      setDeleteEmailTarget(null);
    } finally {
      setDeletingEmail(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900">
            Register Admin Phone Number
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Add your church or personal ministry phone number to use as the sender line for mass SMS dispatches.
          </p>
        </div>

        <form onSubmit={handleAddNumber} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-4">
            <label
              htmlFor="admin-num-label"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Number Label
            </label>
            <input
              id="admin-num-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={ADMIN_NUMBER_CONSTRAINTS.labelMax}
              placeholder="e.g. Pastor Office Line"
              required
              className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#123c69]/20 focus:border-[#123c69]"
            />
          </div>

          <div className="md:col-span-4">
            <label
              htmlFor="admin-num-phone"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Admin Phone Number
            </label>
            <input
              id="admin-num-phone"
              type="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              maxLength={ADMIN_NUMBER_CONSTRAINTS.phoneMax}
              placeholder="0722 627 135 or +254722627135"
              required
              className="w-full px-3.5 py-2.5 text-sm font-mono-tabular text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#123c69]/20 focus:border-[#123c69]"
            />
          </div>

          <div className="md:col-span-2 flex items-center h-[42px]">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={makeDefault}
                onChange={(e) => setMakeDefault(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#123c69]"
              />
              <span>Set as default</span>
            </label>
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#123c69] rounded-lg hover:bg-[#092b4c] disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{submitting ? 'Adding...' : 'Add Number'}</span>
            </button>
          </div>
        </form>

        {phoneInput.trim() && (
          <p className="mt-2 text-xs text-slate-500">
            Normalized E.164:{' '}
            <span className="font-mono-tabular text-slate-700">
              {isValidPhoneNumber(normalizedPreview)
                ? formatPhoneDisplay(normalizedPreview)
                : 'Invalid phone format'}
            </span>
          </p>
        )}

        {error && (
          <div className="mt-4 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
            {error}
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Saved Admin Numbers
          </h2>
          <span className="font-mono-tabular text-xs text-slate-500">
            {adminNumbers.length} registered
          </span>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-11 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : adminNumbers.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <Phone className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-800 mb-1">
              No admin numbers added yet
            </p>
            <p className="text-xs text-slate-500">
              Use the form above to add an administrator phone number for mass SMS outreach.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-6">Label</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Added By</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {adminNumbers.map((item) => {
                  const isEditing = editingId === item.id;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-6 font-medium text-slate-900">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            maxLength={ADMIN_NUMBER_CONSTRAINTS.labelMax}
                            className="px-2.5 py-1.5 text-sm border border-slate-300 rounded-md w-full max-w-[200px]"
                          />
                        ) : (
                          item.label
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-slate-800 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="tel"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            maxLength={ADMIN_NUMBER_CONSTRAINTS.phoneMax}
                            className="px-2.5 py-1.5 text-sm font-mono-tabular border border-slate-300 rounded-md w-full max-w-[180px]"
                          />
                        ) : (
                          formatPhoneDisplay(item.phoneNumber)
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {item.ownerEmail}
                      </td>
                      <td className="py-3 px-4 text-xs whitespace-nowrap">
                        {item.isDefault ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-[#123c69]">
                            <Star className="w-3.5 h-3.5 fill-[#d49a2a] text-[#d49a2a]" />
                            Default Sender
                          </span>
                        ) : (
                          <span className="text-slate-500">Secondary</span>
                        )}
                      </td>
                      <td className="py-3 px-6 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(item.id)}
                              disabled={savingEdit}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-[#123c69] rounded-md hover:bg-[#092b4c] cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            {!item.isDefault && (
                              <button
                                type="button"
                                onClick={() => setDefaultAdminNumber(item.id, adminNumbers)}
                                className="px-2.5 py-1.5 text-xs font-medium text-[#123c69] bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                              >
                                Make Default
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => startEdit(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-white border border-slate-200 rounded-md hover:bg-red-50 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Erase
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#123c69]" />
            <h2 className="text-sm font-semibold text-slate-900">
              Authorized Portal Administrators
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Key in a Google email address manually to authorize another church leader to sign in with Google and manage congregants or mass SMS.
          </p>
        </div>

        <form onSubmit={handleAddAdminEmail} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5">
            <label
              htmlFor="admin-google-email-input"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Google Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="admin-google-email-input"
                type="email"
                value={adminEmailInput}
                onChange={(e) => setAdminEmailInput(e.target.value)}
                maxLength={ADMIN_EMAIL_CONSTRAINTS.emailMax}
                placeholder="e.g. leader@gmail.com"
                required
                className="w-full pl-9 pr-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#123c69]/20 focus:border-[#123c69]"
              />
            </div>
          </div>

          <div className="md:col-span-4">
            <label
              htmlFor="admin-google-name-input"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Name / Role Label (optional)
            </label>
            <input
              id="admin-google-name-input"
              type="text"
              value={adminNameInput}
              onChange={(e) => setAdminNameInput(e.target.value)}
              maxLength={ADMIN_EMAIL_CONSTRAINTS.displayNameMax}
              placeholder="e.g. Church Secretary"
              className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#123c69]/20 focus:border-[#123c69]"
            />
          </div>

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={addingAdminEmail}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#123c69] rounded-lg hover:bg-[#092b4c] disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
            >
              <UserPlus className="w-4 h-4" />
              <span>{addingAdminEmail ? 'Authorizing...' : 'Authorize Email'}</span>
            </button>
          </div>
        </form>

        {adminEmailError && (
          <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
            {adminEmailError}
          </div>
        )}

        {adminEmailSuccess && (
          <div className="p-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
            {adminEmailSuccess}
          </div>
        )}

        <div className="space-y-1 text-xs text-slate-600 pt-1">
          {BOOTSTRAPPED_ADMIN_EMAILS.map((adminEmail) => (
            <div
              key={adminEmail}
              className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0"
            >
              <span className="font-medium text-slate-900 truncate">{adminEmail}</span>
              <span className="text-slate-500 whitespace-nowrap">Primary Administrator</span>
            </div>
          ))}

          {adminEmails
            .filter((entry) => !isBootstrappedAdminEmail(entry.email))
            .map((entry) => {
              const isSelf = entry.email.toLowerCase() === currentUserEmail;
              return (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-slate-900 break-all">
                      {entry.displayName} · {entry.email}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-slate-500 whitespace-nowrap">Authorized Google Email</span>
                    {!isSelf && (
                      <button
                        type="button"
                        onClick={() => setDeleteEmailTarget(entry)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-white border border-slate-200 rounded-md hover:bg-red-50 cursor-pointer whitespace-nowrap"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

          {admins
            .filter(
              (a) =>
                !isBootstrappedAdminEmail(a.email) &&
                !adminEmails.some((e) => e.email.toLowerCase() === a.email.toLowerCase())
            )
            .map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0"
              >
                <span className="font-medium text-slate-900 truncate">
                  {a.displayName} · {a.email}
                </span>
                <span className="text-slate-500 whitespace-nowrap">Administrator</span>
              </div>
            ))}
        </div>
      </section>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Erase Admin Number"
        description={
          deleteTarget
            ? `Remove "${deleteTarget.label}" (${formatPhoneDisplay(
                deleteTarget.phoneNumber
              )}) from saved admin sender numbers?`
            : ''
        }
        confirmLabel="Erase Number"
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />

      <ConfirmModal
        open={Boolean(deleteEmailTarget)}
        title="Remove Authorized Admin Email"
        description={
          deleteEmailTarget
            ? `Revoke admin portal access for ${deleteEmailTarget.email}? They will no longer be able to sign in as an administrator.`
            : ''
        }
        confirmLabel="Remove Access"
        busy={deletingEmail}
        onConfirm={handleConfirmDeleteEmail}
        onCancel={() => !deletingEmail && setDeleteEmailTarget(null)}
      />
    </div>
  );
}
