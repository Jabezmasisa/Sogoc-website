import { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  History,
  MessageSquare,
} from 'lucide-react';
import { formatPhoneDisplay } from '../blueprintConstraints';
import { fetchCampaignRecipients } from '../services/firestoreService';
import type {
  AdminNavSection,
  SmsCampaignRecipientRecord,
  SmsCampaignRecord,
} from '../types';

interface CampaignHistoryViewProps {
  campaigns: SmsCampaignRecord[];
  loading: boolean;
  onNavigate: (section: AdminNavSection) => void;
}

export function CampaignHistoryView({
  campaigns,
  loading,
  onNavigate,
}: CampaignHistoryViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [recipientsMap, setRecipientsMap] = useState<
    Record<string, SmsCampaignRecipientRecord[]>
  >({});
  const [loadingRecipientsId, setLoadingRecipientsId] = useState<string | null>(null);

  const toggleExpand = async (campaignId: string) => {
    if (expandedId === campaignId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(campaignId);
    if (!recipientsMap[campaignId]) {
      setLoadingRecipientsId(campaignId);
      try {
        const list = await fetchCampaignRecipients(campaignId);
        setRecipientsMap((prev) => ({ ...prev, [campaignId]: list }));
      } finally {
        setLoadingRecipientsId(null);
      }
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-slate-900">
          Mass SMS Campaign Log
        </h2>
        <span className="font-mono-tabular text-xs text-slate-500">
          {campaigns.length} {campaigns.length === 1 ? 'campaign' : 'campaigns'}
        </span>
      </div>

      {loading ? (
        <div className="p-6 space-y-3">
          {[1, 2, 3].map((idx) => (
            <div key={idx} className="h-12 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="py-14 px-6 text-center">
          <History className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-900 mb-1.5">
            No mass SMS campaigns yet
          </h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto mb-5">
            Every mass SMS dispatch and its recipient delivery outcome is recorded here for ministry accountability.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('mass-sms')}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#123c69] rounded-lg hover:bg-[#092b4c] transition-colors cursor-pointer"
          >
            <MessageSquare className="w-4 h-4" />
            Compose First Mass SMS
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {campaigns.map((camp) => {
            const isExpanded = expandedId === camp.id;
            const recipients = recipientsMap[camp.id];
            const dateStr = camp.createdAt
              ? camp.createdAt.toDate().toLocaleString('en-KE', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : 'Just now';

            return (
              <div key={camp.id}>
                <button
                  type="button"
                  onClick={() => toggleExpand(camp.id)}
                  className="w-full text-left px-6 py-4 hover:bg-slate-50/80 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                    )}
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium text-slate-900 line-clamp-2">
                        {camp.message}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span className="tabular-nums">{dateStr}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          From{' '}
                          <span className="font-mono-tabular text-slate-700">
                            {formatPhoneDisplay(camp.senderNumber)}
                          </span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Audience: {camp.targetFilter}</span>
                        <span aria-hidden="true">·</span>
                        <span>Provider: {camp.provider}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 pl-7 sm:pl-0">
                    {camp.status === 'sent' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle
                        className={`w-4 h-4 shrink-0 ${
                          camp.status === 'partial' ? 'text-amber-600' : 'text-red-600'
                        }`}
                      />
                    )}
                    <span
                      className={`text-xs font-medium tabular-nums whitespace-nowrap ${
                        camp.status === 'sent'
                          ? 'text-emerald-700'
                          : camp.status === 'partial'
                          ? 'text-amber-700'
                          : 'text-red-700'
                      }`}
                    >
                      {camp.sentCount}/{camp.recipientCount} delivered
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-6 pb-5 pt-2 bg-slate-50/60 border-t border-slate-100">
                    {camp.errorMessage && (
                      <p className="text-xs text-red-700 mb-3">
                        Dispatch note: {camp.errorMessage}
                      </p>
                    )}

                    {loadingRecipientsId === camp.id ? (
                      <div className="h-12 bg-slate-100 rounded animate-pulse" />
                    ) : !recipients || recipients.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No recipient log entries found for this campaign.
                      </p>
                    ) : (
                      <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                              <th className="py-2 px-4">Congregant</th>
                              <th className="py-2 px-4">Phone Number</th>
                              <th className="py-2 px-4">Outcome</th>
                              <th className="py-2 px-4">Details</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {recipients.map((rec) => (
                              <tr key={rec.id}>
                                <td className="py-2 px-4 font-medium text-slate-900">
                                  {rec.congregantName}
                                </td>
                                <td className="py-2 px-4 font-mono-tabular text-slate-700">
                                  {formatPhoneDisplay(rec.phoneNumber)}
                                </td>
                                <td
                                  className={`py-2 px-4 font-medium ${
                                    rec.status === 'sent'
                                      ? 'text-emerald-700'
                                      : 'text-red-700'
                                  }`}
                                >
                                  {rec.status === 'sent' ? 'Sent' : 'Failed'}
                                </td>
                                <td className="py-2 px-4 text-slate-500">
                                  {rec.error || rec.providerMessageId || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
