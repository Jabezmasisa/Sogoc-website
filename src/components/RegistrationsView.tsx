import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ClipboardCheck,
  MessageSquare,
  Pencil,
  Phone,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  AUTOMATION_CONSTRAINTS,
  calculateSmsSegments,
  CONGREGANT_CONSTRAINTS,
  DEFAULT_WELCOME_SMS_TEMPLATE,
  formatPhoneDisplay,
  isValidPhoneNumber,
  normalizePhoneNumber,
  REGISTRATION_CONSTRAINTS,
  renderWelcomeSmsMessage,
} from '../blueprintConstraints';
import {
  approveCongregantRegistration,
  deleteCongregantRegistration,
  rejectCongregantRegistration,
  saveWelcomeAutomation,
} from '../services/firestoreService';
import type {
  AdminNavSection,
  AdminNumberRecord,
  CongregantRegistrationRecord,
  Gender,
  SmsDispatchResponse,
  SmsGatewayConfig,
  WelcomeAutomationConfig,
} from '../types';
import { ConfirmModal } from './ConfirmModal';

interface RegistrationsViewProps {
  user: User;
  registrations: CongregantRegistrationRecord[];
  adminNumbers: AdminNumberRecord[];
  welcomeAutomation: WelcomeAutomationConfig | null;
  smsConfig: SmsGatewayConfig;
  loading: boolean;
  onNavigate: (section: AdminNavSection) => void;
  onSendWelcomeSms: (params: {
    congregantId: string;
    name: string;
    phoneNumber: string;
    registrationId: string;
    senderNumberOverride?: string;
    senderLabelOverride?: string;
    templateOverride?: string;
  }) => Promise<SmsDispatchResponse>;
}

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

export function RegistrationsView({
  user,
  registrations,
  adminNumbers,
  welcomeAutomation,
  smsConfig,
  loading,
  onNavigate,
  onSendWelcomeSms,
}: RegistrationsViewProps) {
  const defaultNum = adminNumbers.find((n) => n.isDefault) ?? adminNumbers[0] ?? null;

  // Automation settings form state
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoOnManualAdd, setAutoOnManualAdd] = useState(false);
  const [senderNumber, setSenderNumber] = useState(defaultNum?.phoneNumber ?? '');
  const [template, setTemplate] = useState(DEFAULT_WELCOME_SMS_TEMPLATE);
  const [savingAuto, setSavingAuto] = useState(false);
  const [autoFeedback, setAutoFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (welcomeAutomation) {
      setAutoEnabled(welcomeAutomation.enabled);
      setAutoOnManualAdd(welcomeAutomation.autoSendOnManualAdd);
      setSenderNumber(welcomeAutomation.senderNumber || defaultNum?.phoneNumber || '');
      setTemplate(welcomeAutomation.messageTemplate || DEFAULT_WELCOME_SMS_TEMPLATE);
    } else if (!senderNumber && defaultNum) {
      setSenderNumber(defaultNum.phoneNumber);
    }
  }, [welcomeAutomation, defaultNum, senderNumber]);

  const activeSenderRecord = useMemo(
    () =>
      adminNumbers.find((n) => n.phoneNumber === senderNumber) ??
      defaultNum ??
      null,
    [adminNumbers, defaultNum, senderNumber]
  );

  const templateMetrics = useMemo(() => calculateSmsSegments(template), [template]);
  const samplePreview = useMemo(
    () => renderWelcomeSmsMessage(template || DEFAULT_WELCOME_SMS_TEMPLATE, 'Grace Atieno'),
    [template]
  );

  // Queue filter & actions state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchApproving, setBatchApproving] = useState(false);
  const [actionBanner, setActionBanner] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // Edit-before-approve modal state
  const [editingReg, setEditingReg] = useState<CongregantRegistrationRecord | null>(null);
  const [editName, setEditName] = useState('');
  const [editGender, setEditGender] = useState<Gender>('Male');
  const [editPhone, setEditPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<CongregantRegistrationRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const counts = useMemo(
    () => ({
      pending: registrations.filter((r) => r.status === 'pending').length,
      approved: registrations.filter((r) => r.status === 'approved').length,
      rejected: registrations.filter((r) => r.status === 'rejected').length,
      all: registrations.length,
    }),
    [registrations]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return registrations.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.phoneNumber.toLowerCase().includes(q) ||
        formatPhoneDisplay(item.phoneNumber).toLowerCase().includes(q) ||
        item.notes.toLowerCase().includes(q)
      );
    });
  }, [registrations, statusFilter, searchQuery]);

  const pendingFiltered = useMemo(
    () => filtered.filter((r) => r.status === 'pending'),
    [filtered]
  );

  const allPendingSelected =
    pendingFiltered.length > 0 && pendingFiltered.every((r) => selectedIds.has(r.id));

  const toggleSelectAllPending = () => {
    const next = new Set(selectedIds);
    if (allPendingSelected) {
      for (const item of pendingFiltered) next.delete(item.id);
    } else {
      for (const item of pendingFiltered) next.add(item.id);
    }
    setSelectedIds(next);
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSaveAutomation = async (e: React.FormEvent) => {
    e.preventDefault();
    setAutoFeedback(null);
    setSavingAuto(true);
    try {
      const chosenSender = activeSenderRecord?.phoneNumber ?? '';
      const chosenLabel = activeSenderRecord?.label ?? '';
      if (autoEnabled && !chosenSender) {
        setAutoFeedback({
          type: 'error',
          text: 'Please add an Admin Sender Number first before enabling automated SMS.',
        });
        setSavingAuto(false);
        return;
      }
      await saveWelcomeAutomation(
        {
          enabled: autoEnabled,
          autoSendOnManualAdd: autoOnManualAdd,
          senderNumber: chosenSender,
          senderLabel: chosenLabel,
          messageTemplate: template,
        },
        user,
        welcomeAutomation
      );
      setAutoFeedback({
        type: 'success',
        text: autoEnabled
          ? 'Automated welcome SMS settings saved and active for new approvals.'
          : 'Welcome SMS template saved (auto-send on approval is currently paused).',
      });
    } catch (err) {
      setAutoFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to save automation settings.',
      });
    } finally {
      setSavingAuto(false);
    }
  };

  const approveSingle = async (
    reg: CongregantRegistrationRecord,
    options?: {
      forceSendSms?: boolean;
      overrides?: { name: string; gender: Gender; phoneNumber: string; notes: string };
    }
  ) => {
    setActionBanner(null);
    setBusyId(reg.id);
    try {
      const approved = await approveCongregantRegistration(reg, user, options?.overrides);
      const nextSel = new Set(selectedIds);
      nextSel.delete(reg.id);
      setSelectedIds(nextSel);

      const shouldAutoSend = Boolean(
        options?.forceSendSms || (welcomeAutomation?.enabled ?? autoEnabled)
      );

      if (shouldAutoSend) {
        if (!activeSenderRecord) {
          setActionBanner({
            type: 'warning',
            text: `${approved.name} was approved and added to Congregants, but no admin sender number is configured to send the welcome SMS.`,
          });
          return;
        }
        const smsRes = await onSendWelcomeSms({
          congregantId: approved.congregantId,
          name: approved.name,
          phoneNumber: approved.phoneNumber,
          registrationId: reg.id,
          senderNumberOverride: activeSenderRecord.phoneNumber,
          senderLabelOverride: activeSenderRecord.label,
          templateOverride: template,
        });
        if (smsRes.ok && smsRes.status === 'sent') {
          setActionBanner({
            type: 'success',
            text: `${approved.name} approved into Congregants and welcome SMS sent to ${formatPhoneDisplay(
              approved.phoneNumber
            )}.`,
          });
        } else {
          setActionBanner({
            type: 'warning',
            text: `${approved.name} approved into Congregants, but welcome SMS could not be delivered (${
              smsRes.errorMessage || 'check SMS carrier settings'
            }).`,
          });
        }
      } else {
        setActionBanner({
          type: 'success',
          text: `${approved.name} approved and added to the official Congregants directory.`,
        });
      }
    } catch (err) {
      setActionBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to approve registration.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleApproveSelected = async (sendSmsToo: boolean) => {
    const targets = registrations.filter(
      (r) => r.status === 'pending' && selectedIds.has(r.id)
    );
    if (targets.length === 0) return;
    setActionBanner(null);
    setBatchApproving(true);
    let approvedCount = 0;
    let smsSentCount = 0;
    let smsFailedCount = 0;

    try {
      for (const reg of targets) {
        const approved = await approveCongregantRegistration(reg, user);
        approvedCount += 1;
        if (sendSmsToo && activeSenderRecord) {
          const res = await onSendWelcomeSms({
            congregantId: approved.congregantId,
            name: approved.name,
            phoneNumber: approved.phoneNumber,
            registrationId: reg.id,
            senderNumberOverride: activeSenderRecord.phoneNumber,
            senderLabelOverride: activeSenderRecord.label,
            templateOverride: template,
          });
          if (res.ok && res.status === 'sent') smsSentCount += 1;
          else smsFailedCount += 1;
        }
      }

      setSelectedIds(new Set());
      if (sendSmsToo) {
        setActionBanner({
          type: smsFailedCount > 0 ? 'warning' : 'success',
          text: `Approved ${approvedCount} congregant${
            approvedCount === 1 ? '' : 's'
          }. Welcome SMS sent: ${smsSentCount}${
            smsFailedCount > 0 ? `, failed: ${smsFailedCount}` : ''
          }.`,
        });
      } else {
        setActionBanner({
          type: 'success',
          text: `Approved ${approvedCount} congregant${
            approvedCount === 1 ? '' : 's'
          } into the official directory.`,
        });
      }
    } catch (err) {
      setActionBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Batch approval encountered an error.',
      });
    } finally {
      setBatchApproving(false);
    }
  };

  const handleReject = async (reg: CongregantRegistrationRecord) => {
    setActionBanner(null);
    setBusyId(reg.id);
    try {
      await rejectCongregantRegistration(reg.id, user);
      const nextSel = new Set(selectedIds);
      nextSel.delete(reg.id);
      setSelectedIds(nextSel);
      setActionBanner({
        type: 'success',
        text: `Marked ${reg.name}'s registration as rejected (not added to Congregants).`,
      });
    } catch (err) {
      setActionBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to reject registration.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleManualWelcomeSms = async (reg: CongregantRegistrationRecord) => {
    setActionBanner(null);
    if (!activeSenderRecord) {
      setActionBanner({
        type: 'error',
        text: 'Add an admin sender phone number first under Admin Numbers.',
      });
      return;
    }
    setBusyId(reg.id);
    try {
      const res = await onSendWelcomeSms({
        congregantId: reg.congregantId || reg.id,
        name: reg.name,
        phoneNumber: reg.phoneNumber,
        registrationId: reg.id,
        senderNumberOverride: activeSenderRecord.phoneNumber,
        senderLabelOverride: activeSenderRecord.label,
        templateOverride: template,
      });
      if (res.ok && res.status === 'sent') {
        setActionBanner({
          type: 'success',
          text: `Welcome SMS sent to ${reg.name} (${formatPhoneDisplay(reg.phoneNumber)}).`,
        });
      } else {
        setActionBanner({
          type: 'warning',
          text: `Welcome SMS failed for ${reg.name}: ${
            res.errorMessage || 'Check SMS gateway configuration.'
          }`,
        });
      }
    } catch (err) {
      setActionBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to send welcome SMS.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const openEditModal = (reg: CongregantRegistrationRecord) => {
    setEditingReg(reg);
    setEditName(reg.name);
    setEditGender(reg.gender);
    setEditPhone(reg.phoneNumber);
    setEditNotes(reg.notes);
    setEditError(null);
    setEditSaving(false);
  };

  const handleEditAndApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReg) return;
    setEditError(null);
    const trimmedName = editName.trim();
    const normalizedPhone = normalizePhoneNumber(editPhone);
    if (!trimmedName) {
      setEditError('Full name is required.');
      return;
    }
    if (!isValidPhoneNumber(normalizedPhone)) {
      setEditError('Enter a valid phone number (e.g., 0722627135 or +254722627135).');
      return;
    }
    setEditSaving(true);
    try {
      await approveSingle(editingReg, {
        overrides: {
          name: trimmedName,
          gender: editGender,
          phoneNumber: normalizedPhone,
          notes: editNotes.trim(),
        },
      });
      setEditingReg(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unable to approve registration.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCongregantRegistration(deleteTarget.id);
      const next = new Set(selectedIds);
      next.delete(deleteTarget.id);
      setSelectedIds(next);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Automated Welcome SMS Settings Card */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#123c69]/10 text-[#123c69] flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Automated Welcome Message to New Congregants
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure an automatic SMS sent to congregants right when an administrator approves their registration.
              </p>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md self-start sm:self-center whitespace-nowrap ${
              welcomeAutomation?.enabled
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                welcomeAutomation?.enabled ? 'bg-emerald-600' : 'bg-slate-400'
              }`}
            />
            {welcomeAutomation?.enabled ? 'Auto-SMS Active' : 'Auto-SMS Paused'}
          </span>
        </div>

        <form onSubmit={handleSaveAutomation} className="p-6 space-y-5">
          {!smsConfig.configured && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2.5 text-xs text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <span>
                SMS carrier credentials (<span className="font-mono-tabular">AT_API_KEY</span> /{' '}
                <span className="font-mono-tabular">TWILIO_ACCOUNT_SID</span>) are not configured on the server yet, so automated welcome SMS attempts will log as failed until carrier keys are added.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <label className="flex items-start gap-3 p-3.5 border border-slate-200 rounded-lg hover:bg-slate-50/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoEnabled}
                  onChange={(e) => setAutoEnabled(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#123c69] focus:ring-[#123c69]"
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium text-slate-900">
                    Automatically send welcome SMS upon approval
                  </span>
                  <span className="block text-xs text-slate-500">
                    When enabled, clicking Approve promotes the person to Congregants and immediately dispatches the welcome SMS below.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3 p-3.5 border border-slate-200 rounded-lg hover:bg-slate-50/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoOnManualAdd}
                  onChange={(e) => setAutoOnManualAdd(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#123c69] focus:ring-[#123c69]"
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium text-slate-900">
                    Default to sending welcome SMS when adding manually
                  </span>
                  <span className="block text-xs text-slate-500">
                    Pre-checks the welcome SMS option inside the Add Congregant modal.
                  </span>
                </span>
              </label>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="auto-sender-select"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Admin Sender Number
                  </label>
                  <button
                    type="button"
                    onClick={() => onNavigate('admin-numbers')}
                    className="text-xs font-medium text-[#123c69] hover:underline cursor-pointer"
                  >
                    Manage Numbers
                  </button>
                </div>

                {adminNumbers.length === 0 ? (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-600">
                      No admin sender numbers saved yet.
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigate('admin-numbers')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#123c69] rounded-md hover:bg-[#092b4c] cursor-pointer whitespace-nowrap"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      Add Number
                    </button>
                  </div>
                ) : (
                  <select
                    id="auto-sender-select"
                    value={activeSenderRecord?.phoneNumber ?? ''}
                    onChange={(e) => setSenderNumber(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#123c69]/20 focus:border-[#123c69]"
                  >
                    {adminNumbers.map((num) => (
                      <option key={num.id} value={num.phoneNumber}>
                        {num.label} — {formatPhoneDisplay(num.phoneNumber)}
                        {num.isDefault ? ' (Default)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="welcome-sms-template"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Welcome Message Template
                  </label>
                  <span className="font-mono-tabular text-xs text-slate-500">
                    {templateMetrics.length}/{AUTOMATION_CONSTRAINTS.templateMax} chars ·{' '}
                    {templateMetrics.segments} SMS
                  </span>
                </div>
                <textarea
                  id="welcome-sms-template"
                  rows={4}
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  maxLength={AUTOMATION_CONSTRAINTS.templateMax}
                  required
                  className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#123c69]/20 focus:border-[#123c69]"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Use <span className="font-mono-tabular font-semibold text-slate-700">{'{name}'}</span> to automatically insert the congregant&apos;s name.
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Sample Preview
                </p>
                <p className="text-xs text-slate-700 leading-relaxed">{samplePreview}</p>
              </div>
            </div>
          </div>

          {autoFeedback && (
            <div
              className={`p-3 text-xs rounded-lg border flex items-center gap-2 ${
                autoFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {autoFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{autoFeedback.text}</span>
            </div>
          )}

          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={savingAuto}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#123c69] rounded-lg hover:bg-[#092b4c] disabled:opacity-60 transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{savingAuto ? 'Saving...' : 'Save Automation Settings'}</span>
            </button>
          </div>
        </form>
      </section>

      {actionBanner && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-start gap-2.5 ${
            actionBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : actionBanner.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {actionBanner.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-700" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <span className="flex-1">{actionBanner.text}</span>
          <button
            type="button"
            onClick={() => setActionBanner(null)}
            aria-label="Dismiss notification"
            className="text-current/70 hover:text-current cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search registrant name, phone, or note..."
              aria-label="Search registrations"
              className="w-full pl-9 pr-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#123c69]/20 focus:border-[#123c69]"
            />
          </div>

          <div
            className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start flex-wrap"
            role="group"
            aria-label="Filter registrations by status"
          >
            {(
              [
                { id: 'pending', label: `Pending (${counts.pending})` },
                { id: 'approved', label: `Approved (${counts.approved})` },
                { id: 'rejected', label: `Rejected (${counts.rejected})` },
                { id: 'all', label: `All (${counts.all})` },
              ] as Array<{ id: StatusFilter; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              disabled={batchApproving}
              onClick={() => void handleApproveSelected(Boolean(welcomeAutomation?.enabled))}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Check className="w-3.5 h-3.5" />
              <span>
                {batchApproving
                  ? 'Approving...'
                  : `Approve Selected (${selectedIds.size})`}
              </span>
            </button>
            {!welcomeAutomation?.enabled && activeSenderRecord && (
              <button
                type="button"
                disabled={batchApproving}
                onClick={() => void handleApproveSelected(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#123c69] rounded-lg hover:bg-[#092b4c] disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Approve &amp; Send Welcome SMS ({selectedIds.size})</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Registrations Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-2.5">
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="h-11 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : registrations.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <div className="w-11 h-11 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-3">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1.5">
              No public congregant registrations yet
            </h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              When members submit the Congregant Registration form on the JCC Sondu website, they appear here for administrator review and approval before entering the official directory.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <p className="text-sm font-medium text-slate-800 mb-1">
              No {statusFilter === 'all' ? '' : statusFilter} registrations match your search
            </p>
            <p className="text-xs text-slate-500 mb-4">
              Switch tabs above or clear your search filter.
            </p>
            {statusFilter !== 'all' && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setSearchQuery('');
                }}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Show All Registrations
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 pl-5 pr-2 w-10">
                    {pendingFiltered.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allPendingSelected}
                        onChange={toggleSelectAllPending}
                        aria-label="Select all pending registrations"
                        className="w-4 h-4 rounded border-slate-300 text-[#123c69] focus:ring-[#123c69] cursor-pointer"
                      />
                    )}
                  </th>
                  <th className="py-3 px-4">Applicant</th>
                  <th className="py-3 px-4">Gender</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4 hidden md:table-cell">Status</th>
                  <th className="py-3 px-4 hidden lg:table-cell">Submitted</th>
                  <th className="py-3 pr-5 pl-4 text-right">Admin Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((reg) => {
                  const isBusy = busyId === reg.id || batchApproving;
                  const isChecked = selectedIds.has(reg.id);
                  const submittedDate = reg.createdAt
                    ? reg.createdAt.toDate().toLocaleDateString('en-KE', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : 'Just now';

                  return (
                    <tr
                      key={reg.id}
                      className={`transition-colors ${
                        isChecked ? 'bg-[#123c69]/[0.03]' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3 pl-5 pr-2 align-top">
                        {reg.status === 'pending' && (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleOne(reg.id)}
                            aria-label={`Select ${reg.name}`}
                            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#123c69] focus:ring-[#123c69] cursor-pointer"
                          />
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{reg.name}</p>
                        {reg.notes && (
                          <p className="text-xs text-slate-500 mt-0.5 max-w-xs line-clamp-2">
                            {reg.notes}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 align-top">{reg.gender}</td>
                      <td className="py-3 px-4 font-mono-tabular text-slate-800 whitespace-nowrap align-top">
                        {formatPhoneDisplay(reg.phoneNumber)}
                      </td>
                      <td className="py-3 px-4 hidden md:table-cell align-top">
                        <div className="space-y-1">
                          <span
                            className={`inline-block px-2 py-0.5 text-xs font-medium rounded-md capitalize ${
                              reg.status === 'approved'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : reg.status === 'rejected'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : 'bg-amber-50 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {reg.status === 'pending' ? 'Needs Approval' : reg.status}
                          </span>
                          {reg.status === 'approved' && (
                            <span
                              className={`block text-[11px] font-medium ${
                                reg.welcomeSmsStatus === 'sent'
                                  ? 'text-emerald-700'
                                  : reg.welcomeSmsStatus === 'failed'
                                  ? 'text-amber-700'
                                  : 'text-slate-500'
                              }`}
                            >
                              {reg.welcomeSmsStatus === 'sent'
                                ? 'Welcome SMS sent'
                                : reg.welcomeSmsStatus === 'failed'
                                ? 'Welcome SMS failed'
                                : 'Welcome SMS not sent'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 tabular-nums hidden lg:table-cell whitespace-nowrap align-top">
                        {submittedDate}
                      </td>
                      <td className="py-3 pr-5 pl-4 text-right whitespace-nowrap align-top">
                        <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                          {reg.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void approveSingle(reg)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-emerald-700 rounded-md hover:bg-emerald-800 disabled:opacity-50 transition-colors cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>
                                  {busyId === reg.id
                                    ? 'Approving...'
                                    : welcomeAutomation?.enabled
                                    ? 'Approve & SMS'
                                    : 'Approve'}
                                </span>
                              </button>
                              {!welcomeAutomation?.enabled && activeSenderRecord && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void approveSingle(reg, { forceSendSms: true })}
                                  title="Approve into Congregants and send Welcome SMS"
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-[#123c69] rounded-md hover:bg-[#092b4c] disabled:opacity-50 transition-colors cursor-pointer"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  <span>Approve + SMS</span>
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => openEditModal(reg)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 hover:text-[#123c69] disabled:opacity-50 transition-colors cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleReject(reg)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-white border border-slate-200 rounded-md hover:bg-amber-50 hover:border-amber-200 disabled:opacity-50 transition-colors cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Reject</span>
                              </button>
                            </>
                          )}

                          {reg.status === 'approved' && reg.welcomeSmsStatus !== 'sent' && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleManualWelcomeSms(reg)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-[#123c69] rounded-md hover:bg-[#092b4c] disabled:opacity-50 transition-colors cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>
                                {busyId === reg.id ? 'Sending...' : 'Send Welcome SMS'}
                              </span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setDeleteTarget(reg)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-white border border-slate-200 rounded-md hover:bg-red-50 hover:border-red-200 disabled:opacity-50 transition-colors cursor-pointer"
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

      {/* Edit & Approve Modal */}
      {editingReg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-registration-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 mb-5">
              <h2 id="edit-registration-title" className="text-lg font-semibold text-slate-900">
                Review &amp; Approve Congregant
              </h2>
              <button
                type="button"
                onClick={() => !editSaving && setEditingReg(null)}
                aria-label="Close modal"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditAndApprove} className="space-y-4">
              <div>
                <label
                  htmlFor="edit-reg-name"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Full Name
                </label>
                <input
                  id="edit-reg-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={CONGREGANT_CONSTRAINTS.nameMax}
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
                      onClick={() => setEditGender(option)}
                      className={`py-2 px-3 text-sm font-medium rounded-lg border transition-colors cursor-pointer ${
                        editGender === option
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
                  htmlFor="edit-reg-phone"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Phone Number
                </label>
                <input
                  id="edit-reg-phone"
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  maxLength={CONGREGANT_CONSTRAINTS.phoneMax}
                  required
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tabular text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#123c69]/20 focus:border-[#123c69]"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-reg-notes"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Ministry / Notes
                </label>
                <textarea
                  id="edit-reg-notes"
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  maxLength={REGISTRATION_CONSTRAINTS.notesMax}
                  className="w-full px-3.5 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#123c69]/20 focus:border-[#123c69]"
                />
              </div>

              {editError && (
                <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  {editError}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingReg(null)}
                  disabled={editSaving}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="px-5 py-2 text-sm font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
                >
                  {editSaving
                    ? 'Approving...'
                    : welcomeAutomation?.enabled
                    ? 'Approve & Send Welcome SMS'
                    : 'Approve & Save Congregant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Erase Registration Record"
        description={
          deleteTarget
            ? `Permanently delete the registration submitted by ${deleteTarget.name} (${formatPhoneDisplay(
                deleteTarget.phoneNumber
              )})? This will not delete an already-approved Congregants record.`
            : ''
        }
        confirmLabel="Erase Registration"
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}
