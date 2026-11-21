import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Phone,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  calculateSmsSegments,
  formatPhoneDisplay,
  SMS_CAMPAIGN_CONSTRAINTS,
} from '../blueprintConstraints';
import { logSmsCampaign } from '../services/firestoreService';
import { dispatchMassSms } from '../services/smsApi';
import type {
  AdminNavSection,
  AdminNumberRecord,
  CongregantRecord,
  SmsDispatchResponse,
  SmsGatewayConfig,
  TargetFilter,
} from '../types';

interface MassSmsViewProps {
  user: User;
  congregants: CongregantRecord[];
  adminNumbers: AdminNumberRecord[];
  smsConfig: SmsGatewayConfig;
  preselectedCongregantIds: string[];
  onClearPreselection: () => void;
  onNavigate: (section: AdminNavSection) => void;
}

export function MassSmsView({
  user,
  congregants,
  adminNumbers,
  smsConfig,
  preselectedCongregantIds,
  onClearPreselection,
  onNavigate,
}: MassSmsViewProps) {
  const defaultNum = adminNumbers.find((n) => n.isDefault) ?? adminNumbers[0] ?? null;

  const [selectedSenderId, setSelectedSenderId] = useState<string>(defaultNum?.id ?? '');
  const [targetFilter, setTargetFilter] = useState<TargetFilter>(
    preselectedCongregantIds.length > 0 ? 'Custom' : 'All'
  );
  const [customSelectedIds, setCustomSelectedIds] = useState<Set<string>>(
    () => new Set(preselectedCongregantIds)
  );
  const [customSearch, setCustomSearch] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [dispatchOutcome, setDispatchOutcome] = useState<SmsDispatchResponse | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedNumbers, setCopiedNumbers] = useState(false);

  useEffect(() => {
    if (!selectedSenderId && defaultNum) {
      setSelectedSenderId(defaultNum.id);
    } else if (
      selectedSenderId &&
      !adminNumbers.some((n) => n.id === selectedSenderId) &&
      defaultNum
    ) {
      setSelectedSenderId(defaultNum.id);
    }
  }, [adminNumbers, defaultNum, selectedSenderId]);

  useEffect(() => {
    if (preselectedCongregantIds.length > 0) {
      setTargetFilter('Custom');
      setCustomSelectedIds(new Set(preselectedCongregantIds));
    }
  }, [preselectedCongregantIds]);

  const activeSender = useMemo(
    () => adminNumbers.find((n) => n.id === selectedSenderId) ?? defaultNum,
    [adminNumbers, defaultNum, selectedSenderId]
  );

  const targetedRecipients = useMemo(() => {
    if (targetFilter === 'All') return congregants;
    if (targetFilter === 'Custom') {
      return congregants.filter((c) => customSelectedIds.has(c.id));
    }
    return congregants.filter((c) => c.gender === targetFilter);
  }, [congregants, customSelectedIds, targetFilter]);

  const filteredCustomCandidates = useMemo(() => {
    const q = customSearch.trim().toLowerCase();
    if (!q) return congregants;
    return congregants.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phoneNumber.toLowerCase().includes(q)
    );
  }, [congregants, customSearch]);

  const smsMetrics = useMemo(() => calculateSmsSegments(message), [message]);

  const toggleCustomId = (id: string) => {
    const next = new Set(customSelectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCustomSelectedIds(next);
  };

  const handleCopyNumbers = async () => {
    if (targetedRecipients.length === 0) return;
    const text = targetedRecipients.map((r) => r.phoneNumber).join(', ');
    await navigator.clipboard.writeText(text);
    setCopiedNumbers(true);
    setTimeout(() => setCopiedNumbers(false), 2000);
  };

  const handleSendMassSms = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setDispatchOutcome(null);

    if (!activeSender) {
      setFormError('Please add an admin sender phone number first.');
      return;
    }
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setFormError('Please enter an SMS message to send.');
      return;
    }
    if (targetedRecipients.length === 0) {
      setFormError('Select at least one congregant recipient.');
      return;
    }

    setSending(true);
    try {
      const response = await dispatchMassSms({
        user,
        senderNumber: activeSender.phoneNumber,
        message: trimmedMessage,
        recipients: targetedRecipients.map((r) => ({
          id: r.id,
          name: r.name,
          phoneNumber: r.phoneNumber,
        })),
      });

      await logSmsCampaign({
        senderNumber: activeSender.phoneNumber,
        senderLabel: activeSender.label,
        message: trimmedMessage,
        targetFilter,
        sentCount: response.sentCount,
        failedCount: response.failedCount,
        status: response.status,
        provider: response.provider,
        errorMessage: response.errorMessage,
        results: response.results,
        user,
      });

      setDispatchOutcome(response);
      if (response.ok && response.status === 'sent') {
        setMessage('');
        onClearPreselection();
      }
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Unable to send mass SMS request.'
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {!smsConfig.configured && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                SMS Carrier Credentials Not Configured on Server
              </p>
              <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                To deliver live SMS messages over mobile networks, configure Africa&apos;s Talking (
                <span className="font-mono-tabular">AT_API_KEY</span>,{' '}
                <span className="font-mono-tabular">AT_USERNAME</span>) or Twilio (
                <span className="font-mono-tabular">TWILIO_ACCOUNT_SID</span>,{' '}
                <span className="font-mono-tabular">TWILIO_AUTH_TOKEN</span>) environment variables on the server.
              </p>
            </div>
          </div>
          {targetedRecipients.length > 0 && (
            <button
              type="button"
              onClick={handleCopyNumbers}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-amber-900 bg-white border border-amber-300 rounded-lg hover:bg-amber-100/60 transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{copiedNumbers ? 'Copied Numbers' : 'Copy Recipient Numbers'}</span>
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <form
          onSubmit={handleSendMassSms}
          className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="sender-number-select"
                className="block text-sm font-medium text-slate-700"
              >
                Admin Sender Number
              </label>
              <button
                type="button"
                onClick={() => onNavigate('admin-numbers')}
                className="text-xs font-medium text-[#123c69] hover:underline cursor-pointer"
              >
                Manage Admin Numbers
              </button>
            </div>

            {adminNumbers.length === 0 ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  No admin phone numbers added yet. Add your number before sending mass SMS.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('admin-numbers')}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-[#123c69] rounded-lg hover:bg-[#092b4c] cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Phone className="w-3.5 h-3.5" />
                  Add Admin Number
                </button>
              </div>
            ) : (
              <select
                id="sender-number-select"
                value={activeSender?.id ?? ''}
                onChange={(e) => setSelectedSenderId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#123c69]/20 focus:border-[#123c69]"
              >
                {adminNumbers.map((num) => (
                  <option key={num.id} value={num.id}>
                    {num.label} — {formatPhoneDisplay(num.phoneNumber)}
                    {num.isDefault ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <span className="block text-sm font-medium text-slate-700 mb-2">
              Target Congregants
            </span>
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
              {(['All', 'Male', 'Female', 'Other', 'Custom'] as TargetFilter[]).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setTargetFilter(filter)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    targetFilter === filter
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {filter === 'All'
                    ? `All (${congregants.length})`
                    : filter === 'Custom'
                    ? `Custom (${customSelectedIds.size})`
                    : `${filter} (${congregants.filter((c) => c.gender === filter).length})`}
                </button>
              ))}
            </div>

            {targetFilter === 'Custom' && (
              <div className="mt-3 border border-slate-200 rounded-lg overflow-hidden">
                <div className="p-2.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
                  <input
                    type="search"
                    value={customSearch}
                    onChange={(e) => setCustomSearch(e.target.value)}
                    placeholder="Filter congregants to include..."
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#123c69]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setCustomSelectedIds(new Set(congregants.map((c) => c.id)))
                    }
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomSelectedIds(new Set())}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                  >
                    Clear
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {filteredCustomCandidates.length === 0 ? (
                    <p className="p-4 text-xs text-slate-500 text-center">
                      No congregants match your search.
                    </p>
                  ) : (
                    filteredCustomCandidates.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center justify-between gap-3 px-3.5 py-2 hover:bg-slate-50 cursor-pointer text-xs"
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={customSelectedIds.has(c.id)}
                            onChange={() => toggleCustomId(c.id)}
                            className="w-4 h-4 rounded border-slate-300 text-[#123c69]"
                          />
                          <span className="font-medium text-slate-900 truncate">
                            {c.name}
                          </span>
                          <span className="text-slate-500">· {c.gender}</span>
                        </span>
                        <span className="font-mono-tabular text-slate-600 shrink-0">
                          {formatPhoneDisplay(c.phoneNumber)}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="sms-message-body"
                className="block text-sm font-medium text-slate-700"
              >
                SMS Message
              </label>
              <span className="font-mono-tabular text-xs text-slate-500">
                {smsMetrics.length}/{SMS_CAMPAIGN_CONSTRAINTS.messageMax} chars ·{' '}
                {smsMetrics.segments} {smsMetrics.segments === 1 ? 'SMS' : 'SMS parts'} (
                {smsMetrics.encoding})
              </span>
            </div>
            <textarea
              id="sms-message-body"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={SMS_CAMPAIGN_CONSTRAINTS.messageMax}
              placeholder="Write your announcement for JCC Sondu congregants (e.g., Sunday Service begins at 9:00 AM at Sondu Gospel Centre)..."
              required
              className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#123c69]/20 focus:border-[#123c69] resize-y"
            />
          </div>

          {formError && (
            <div className="p-3.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {formError}
            </div>
          )}

          {dispatchOutcome && (
            <div
              className={`p-4 border rounded-lg text-sm ${
                dispatchOutcome.status === 'sent'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : dispatchOutcome.status === 'partial'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {dispatchOutcome.status === 'sent' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <p className="font-semibold">
                    {dispatchOutcome.status === 'sent'
                      ? `Mass SMS sent to ${dispatchOutcome.sentCount} congregants`
                      : dispatchOutcome.status === 'partial'
                      ? `Partially sent: ${dispatchOutcome.sentCount} succeeded, ${dispatchOutcome.failedCount} failed`
                      : 'Mass SMS dispatch failed (logged to Campaign History)'}
                  </p>
                  {dispatchOutcome.errorMessage && (
                    <p className="text-xs opacity-90">{dispatchOutcome.errorMessage}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="pt-1 flex items-center justify-between gap-4 flex-wrap">
            <span className="text-xs text-slate-500 tabular-nums">
              Ready to send to {targetedRecipients.length}{' '}
              {targetedRecipients.length === 1 ? 'congregant' : 'congregants'}
            </span>
            <button
              type="submit"
              disabled={
                sending ||
                !activeSender ||
                targetedRecipients.length === 0 ||
                message.trim().length === 0
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#123c69] rounded-lg hover:bg-[#092b4c] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Send className="w-4 h-4" />
              <span>
                {sending
                  ? 'Dispatching...'
                  : `Send Mass SMS (${targetedRecipients.length})`}
              </span>
            </button>
          </div>
        </form>

        <aside className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-3">
              Dispatch Summary
            </h2>
            <dl className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                <dt className="text-slate-500">Sender Number</dt>
                <dd className="font-mono-tabular font-medium text-slate-900">
                  {activeSender ? formatPhoneDisplay(activeSender.phoneNumber) : 'None'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                <dt className="text-slate-500">Audience Group</dt>
                <dd className="font-medium text-slate-900">{targetFilter}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100">
                <dt className="text-slate-500">Recipients</dt>
                <dd className="font-mono-tabular font-semibold text-slate-900">
                  {targetedRecipients.length}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-1.5">
                <dt className="text-slate-500">Total SMS Units</dt>
                <dd className="font-mono-tabular font-medium text-slate-900">
                  {targetedRecipients.length * Math.max(smsMetrics.segments, 1)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span>Recipient List Preview</span>
              </h3>
              <span className="font-mono-tabular text-xs text-slate-500">
                {targetedRecipients.length}
              </span>
            </div>

            {targetedRecipients.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">
                No congregants currently match this audience selection.
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {targetedRecipients.slice(0, 50).map((person) => (
                  <li
                    key={person.id}
                    className="flex items-center justify-between gap-2 text-xs py-1 border-b border-slate-50 last:border-0"
                  >
                    <span className="text-slate-800 truncate">{person.name}</span>
                    <span className="font-mono-tabular text-slate-500 shrink-0">
                      {formatPhoneDisplay(person.phoneNumber)}
                    </span>
                  </li>
                ))}
                {targetedRecipients.length > 50 && (
                  <li className="text-xs text-slate-500 pt-1 tabular-nums">
                    + {targetedRecipients.length - 50} more congregants
                  </li>
                )}
              </ul>
            )}
          </div>

          <div className="pt-4 border-t border-slate-200">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                <Sparkles className="w-3.5 h-3.5 text-[#123c69]" />
                <span>Automated Welcome SMS</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Want new congregants to receive an automatic welcome text right when approved?
              </p>
              <button
                type="button"
                onClick={() => onNavigate('registrations')}
                className="text-xs font-medium text-[#123c69] hover:underline cursor-pointer"
              >
                Configure Automated Welcome SMS →
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
