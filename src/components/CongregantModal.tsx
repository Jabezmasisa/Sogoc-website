import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  CONGREGANT_CONSTRAINTS,
  formatPhoneDisplay,
  isValidPhoneNumber,
  normalizePhoneNumber,
} from '../blueprintConstraints';
import type { CongregantRecord, Gender } from '../types';

interface CongregantModalProps {
  open: boolean;
  editingRecord: CongregantRecord | null;
  defaultSendWelcomeSms?: boolean;
  hasSenderNumber?: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    gender: Gender;
    phoneNumber: string;
    sendWelcomeSms?: boolean;
  }) => Promise<void>;
}

export function CongregantModal({
  open,
  editingRecord,
  defaultSendWelcomeSms = false,
  hasSenderNumber = false,
  onClose,
  onSave,
}: CongregantModalProps) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('Male');
  const [phoneInput, setPhoneInput] = useState('');
  const [sendWelcomeSms, setSendWelcomeSms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editingRecord?.name ?? '');
      setGender(editingRecord?.gender ?? 'Male');
      setPhoneInput(editingRecord?.phoneNumber ?? '');
      setSendWelcomeSms(!editingRecord && defaultSendWelcomeSms && hasSenderNumber);
      setError(null);
      setSaving(false);
    }
  }, [open, editingRecord, defaultSendWelcomeSms, hasSenderNumber]);

  if (!open) return null;

  const normalizedPreview = normalizePhoneNumber(phoneInput);
  const isPhoneOkay = phoneInput.trim().length > 0 && isValidPhoneNumber(normalizedPreview);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter the congregant’s full name.');
      return;
    }
    if (!isValidPhoneNumber(normalizedPreview)) {
      setError('Enter a valid phone number (e.g., 0722627135 or +254722627135).');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: trimmedName,
        gender,
        phoneNumber: normalizedPreview,
        sendWelcomeSms: !editingRecord ? sendWelcomeSms : false,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save congregant record.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45"
      role="dialog"
      aria-modal="true"
      aria-labelledby="congregant-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 mb-5">
          <h2 id="congregant-modal-title" className="text-lg font-semibold text-slate-900">
            {editingRecord ? 'Edit Congregant' : 'Add Congregant'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="congregant-name"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Full Name
            </label>
            <input
              id="congregant-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={CONGREGANT_CONSTRAINTS.nameMax}
              placeholder="e.g. Grace Atieno"
              required
              className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#123c69]/20 focus:border-[#123c69]"
            />
          </div>

          <div>
            <span className="block text-sm font-medium text-slate-700 mb-1.5">
              Gender
            </span>
            <div className="grid grid-cols-3 gap-2">
              {CONGREGANT_CONSTRAINTS.genders.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setGender(option)}
                  className={`py-2.5 px-3 text-sm font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                    gender === option
                      ? 'bg-[#123c69] text-white border-[#123c69]'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="congregant-phone"
              className="block text-sm font-medium text-slate-700 mb-1.5"
            >
              Phone Number
            </label>
            <input
              id="congregant-phone"
              type="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              maxLength={CONGREGANT_CONSTRAINTS.phoneMax}
              placeholder="0722 627 135 or +254722627135"
              required
              className="w-full px-3.5 py-2.5 text-sm font-mono-tabular text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#123c69]/20 focus:border-[#123c69]"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              {phoneInput.trim() ? (
                isPhoneOkay ? (
                  <>
                    Normalized format:{' '}
                    <span className="font-mono-tabular text-slate-700">
                      {formatPhoneDisplay(normalizedPreview)}
                    </span>
                  </>
                ) : (
                  'Enter 10-digit Kenyan number (07.../01...) or international +E.164 format.'
                )
              ) : (
                'Local 07xx numbers automatically normalize to +254 for SMS delivery.'
              )}
            </p>
          </div>

          {!editingRecord && (
            <label
              className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs ${
                hasSenderNumber
                  ? 'border-slate-200 bg-slate-50/70 cursor-pointer'
                  : 'border-slate-200 bg-slate-50/40 opacity-70 cursor-not-allowed'
              }`}
            >
              <input
                type="checkbox"
                checked={sendWelcomeSms}
                disabled={!hasSenderNumber}
                onChange={(e) => setSendWelcomeSms(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#123c69] focus:ring-[#123c69]"
              />
              <span className="space-y-0.5">
                <span className="block font-medium text-slate-800">
                  Send automated welcome SMS after saving
                </span>
                <span className="block text-slate-500">
                  {hasSenderNumber
                    ? 'Dispatches your configured welcome message template to this congregant.'
                    : 'Add an Admin Number first to enable automated welcome messages.'}
                </span>
              </span>
            </label>
          )}

          {error && (
            <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 text-sm font-medium text-white bg-[#123c69] rounded-lg hover:bg-[#092b4c] disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
            >
              {saving ? 'Saving...' : editingRecord ? 'Save Changes' : 'Save Congregant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
