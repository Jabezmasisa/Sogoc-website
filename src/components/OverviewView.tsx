import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  MessageSquare,
  Phone,
  UserPlus,
  Users,
} from 'lucide-react';
import { formatPhoneDisplay } from '../blueprintConstraints';
import type {
  AdminNavSection,
  AdminNumberRecord,
  CongregantRecord,
  CongregantRegistrationRecord,
  SmsCampaignRecord,
  SmsGatewayConfig,
  WelcomeAutomationConfig,
} from '../types';

interface OverviewViewProps {
  congregants: CongregantRecord[];
  pendingRegistrations: CongregantRegistrationRecord[];
  welcomeAutomation: WelcomeAutomationConfig | null;
  adminNumbers: AdminNumberRecord[];
  campaigns: SmsCampaignRecord[];
  smsConfig: SmsGatewayConfig;
  loading: boolean;
  onNavigate: (section: AdminNavSection) => void;
  onOpenAddCongregant: () => void;
}

export function OverviewView({
  congregants,
  pendingRegistrations,
  welcomeAutomation,
  adminNumbers,
  campaigns,
  smsConfig,
  loading,
  onNavigate,
  onOpenAddCongregant,
}: OverviewViewProps) {
  const maleCount = congregants.filter((c) => c.gender === 'Male').length;
  const femaleCount = congregants.filter((c) => c.gender === 'Female').length;
  const otherCount = congregants.filter((c) => c.gender === 'Other').length;
  const defaultNumber =
    adminNumbers.find((n) => n.isDefault) ?? adminNumbers[0] ?? null;

  const recentCongregants = congregants.slice(0, 5);
  const recentCampaigns = campaigns.slice(0, 5);

  return (
    <div className="space-y-6">
      {!loading && pendingRegistrations.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ClipboardCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                {pendingRegistrations.length} new congregant{' '}
                {pendingRegistrations.length === 1 ? 'registration' : 'registrations'} awaiting admin approval
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                Review submitted details to approve into the Congregants directory
                {welcomeAutomation?.enabled
                  ? ' and automatically send a welcome SMS.'
                  : ' or configure automated welcome SMS.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('registrations')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#123c69] rounded-lg hover:bg-[#092b4c] transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
          >
            <span>Review &amp; Approve</span>
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>Total Congregants</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          {loading ? (
            <div className="h-8 w-20 bg-slate-100 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-slate-900 tabular-nums">
              {congregants.length}
            </p>
          )}
          <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
            Male {maleCount} · Female {femaleCount}
            {otherCount > 0 ? ` · Other ${otherCount}` : ''}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>Active Admin Number</span>
            <Phone className="w-4 h-4 text-slate-400" />
          </div>
          {loading ? (
            <div className="h-8 w-36 bg-slate-100 rounded animate-pulse" />
          ) : defaultNumber ? (
            <>
              <p className="text-lg font-semibold text-slate-900 font-mono-tabular truncate">
                {formatPhoneDisplay(defaultNumber.phoneNumber)}
              </p>
              <p className="mt-1.5 text-xs text-slate-500 truncate">
                {defaultNumber.label} · {adminNumbers.length} saved
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-semibold text-amber-700">Not Configured</p>
              <button
                type="button"
                onClick={() => onNavigate('admin-numbers')}
                className="mt-1.5 text-xs font-medium text-[#123c69] hover:underline cursor-pointer"
              >
                Add admin number →
              </button>
            </>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>Mass SMS Campaigns</span>
            <MessageSquare className="w-4 h-4 text-slate-400" />
          </div>
          {loading ? (
            <div className="h-8 w-16 bg-slate-100 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-slate-900 tabular-nums">
              {campaigns.length}
            </p>
          )}
          <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
            {campaigns.reduce((acc, c) => acc + c.sentCount, 0)} messages delivered
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>SMS Carrier Gateway</span>
            {smsConfig.configured ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600" />
            )}
          </div>
          <p className="text-lg font-semibold text-slate-900">
            {smsConfig.configured
              ? smsConfig.provider === 'africastalking'
                ? "Africa's Talking"
                : 'Twilio SMS'
              : 'Env Vars Required'}
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            {smsConfig.configured
              ? 'Server carrier dispatch ready'
              : 'Configure gateway in server env'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Recent Congregants
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('congregants')}
              className="text-xs font-medium text-[#123c69] hover:underline cursor-pointer whitespace-nowrap"
            >
              View Directory
            </button>
          </div>

          {loading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map((row) => (
                <div key={row} className="h-9 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : recentCongregants.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-600 mb-4">
                No congregants stored yet. Add your first member to start building the church directory.
              </p>
              <button
                type="button"
                onClick={onOpenAddCongregant}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#123c69] rounded-lg hover:bg-[#092b4c] transition-colors cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                Add First Congregant
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50/60">
                    <th className="py-2.5 px-5">Name</th>
                    <th className="py-2.5 px-4">Gender</th>
                    <th className="py-2.5 px-5 text-right">Phone Number</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {recentCongregants.map((person) => (
                    <tr key={person.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-5 font-medium text-slate-900">
                        {person.name}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{person.gender}</td>
                      <td className="py-2.5 px-5 text-right font-mono-tabular text-slate-700">
                        {formatPhoneDisplay(person.phoneNumber)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Recent Mass SMS Campaigns
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('campaigns')}
              className="text-xs font-medium text-[#123c69] hover:underline cursor-pointer whitespace-nowrap"
            >
              View History
            </button>
          </div>

          {loading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map((row) => (
                <div key={row} className="h-9 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : recentCampaigns.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-600 mb-4">
                No mass SMS campaigns dispatched yet. Add an admin number and compose your first announcement.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('mass-sms')}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#123c69] rounded-lg hover:bg-[#092b4c] transition-colors cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                Compose Mass SMS
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentCampaigns.map((camp) => (
                <div key={camp.id} className="px-5 py-3 hover:bg-slate-50/70">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-xs font-medium text-slate-900 truncate">
                      To: {camp.targetFilter} ({camp.recipientCount})
                    </span>
                    <span
                      className={`text-xs font-medium whitespace-nowrap ${
                        camp.status === 'sent'
                          ? 'text-emerald-700'
                          : camp.status === 'partial'
                          ? 'text-amber-700'
                          : 'text-red-700'
                      }`}
                    >
                      {camp.status === 'sent'
                        ? `Sent (${camp.sentCount})`
                        : camp.status === 'partial'
                        ? `Partial (${camp.sentCount}/${camp.recipientCount})`
                        : `Failed (${camp.failedCount})`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-1">{camp.message}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
