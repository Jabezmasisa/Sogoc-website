import { useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { ArrowLeft, Lock, LogIn, LogOut, Mail, ShieldAlert } from 'lucide-react';
import { auth, googleProvider } from './firebase';
import { isValidAdminEmailAddress, normalizeEmail } from './blueprintConstraints';
import {
  createCongregant,
  deleteCongregant,
  subscribeAdminEmails,
  subscribeAdminNumbers,
  subscribeAdmins,
  subscribeCongregants,
  subscribeSmsCampaigns,
  updateCongregant,
  verifyUserIsAdmin,
} from './services/firestoreService';
import { fetchSmsGatewayConfig } from './services/smsApi';
import type {
  AdminEmailRecord,
  AdminNavSection,
  AdminNumberRecord,
  AdminUserRecord,
  CongregantRecord,
  Gender,
  SmsCampaignRecord,
  SmsGatewayConfig,
} from './types';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { OverviewView } from './components/OverviewView';
import { CongregantsView } from './components/CongregantsView';
import { MassSmsView } from './components/MassSmsView';
import { AdminNumbersView } from './components/AdminNumbersView';
import { CampaignHistoryView } from './components/CampaignHistoryView';
import { CongregantModal } from './components/CongregantModal';

export function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [manualGoogleEmail, setManualGoogleEmail] = useState('');

  const [activeSection, setActiveSection] = useState<AdminNavSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [congregants, setCongregants] = useState<CongregantRecord[]>([]);
  const [adminNumbers, setAdminNumbers] = useState<AdminNumberRecord[]>([]);
  const [campaigns, setCampaigns] = useState<SmsCampaignRecord[]>([]);
  const [admins, setAdmins] = useState<AdminUserRecord[]>([]);
  const [adminEmails, setAdminEmails] = useState<AdminEmailRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [fatalDataError, setFatalDataError] = useState<Error | null>(null);

  const [smsConfig, setSmsConfig] = useState<SmsGatewayConfig>({
    configured: false,
    provider: null,
    senderHint: null,
  });

  const [congregantModalOpen, setCongregantModalOpen] = useState(false);
  const [editingCongregant, setEditingCongregant] = useState<CongregantRecord | null>(null);
  const [preselectedSmsIds, setPreselectedSmsIds] = useState<string[]>([]);

  if (fatalDataError) {
    throw fatalDataError;
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthError(null);
      if (!nextUser) {
        setIsAdmin(false);
        setCheckingAdmin(false);
        setAuthReady(true);
        return;
      }

      setCheckingAdmin(true);
      try {
        const authorized = await verifyUserIsAdmin(nextUser);
        setIsAdmin(authorized);
      } catch (err) {
        setIsAdmin(false);
        setAuthError(
          err instanceof Error ? err.message : 'Unable to verify administrator access.'
        );
      } finally {
        setCheckingAdmin(false);
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !user || !isAdmin) {
      setCongregants([]);
      setAdminNumbers([]);
      setCampaigns([]);
      setAdmins([]);
      setAdminEmails([]);
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    let loadedFlags = { c: false, n: false, s: false };
    const markLoaded = (key: 'c' | 'n' | 's') => {
      loadedFlags = { ...loadedFlags, [key]: true };
      if (loadedFlags.c && loadedFlags.n && loadedFlags.s) {
        setDataLoading(false);
      }
    };

    const unsubCongregants = subscribeCongregants(
      (items) => {
        setCongregants(items);
        markLoaded('c');
      },
      (err) => setFatalDataError(err)
    );

    const unsubNumbers = subscribeAdminNumbers(
      (items) => {
        setAdminNumbers(items);
        markLoaded('n');
      },
      (err) => setFatalDataError(err)
    );

    const unsubCampaigns = subscribeSmsCampaigns(
      (items) => {
        setCampaigns(items);
        markLoaded('s');
      },
      (err) => setFatalDataError(err)
    );

    const unsubAdmins = subscribeAdmins(
      (items) => setAdmins(items),
      (err) => setFatalDataError(err)
    );

    const unsubAdminEmails = subscribeAdminEmails(
      (items) => setAdminEmails(items),
      (err) => setFatalDataError(err)
    );

    void fetchSmsGatewayConfig().then(setSmsConfig);

    return () => {
      unsubCongregants();
      unsubNumbers();
      unsubCampaigns();
      unsubAdmins();
      unsubAdminEmails();
    };
  }, [authReady, user, isAdmin]);

  const handleSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);

    const trimmedEmail = normalizeEmail(manualGoogleEmail);
    if (trimmedEmail && !isValidAdminEmailAddress(trimmedEmail)) {
      setAuthError('Enter a valid Google email address or leave the field blank to pick an account.');
      return;
    }

    setSigningIn(true);
    try {
      if (trimmedEmail) {
        const hintedProvider = new GoogleAuthProvider();
        hintedProvider.setCustomParameters({
          prompt: 'select_account',
          login_hint: trimmedEmail,
        });
        await signInWithPopup(auth, hintedProvider);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Google Sign-In did not complete.'
      );
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setActiveSection('overview');
  };

  const handleSaveCongregant = async (payload: {
    name: string;
    gender: Gender;
    phoneNumber: string;
  }) => {
    if (!user) return;
    if (editingCongregant) {
      await updateCongregant(editingCongregant.id, payload);
    } else {
      await createCongregant(payload, user.uid);
    }
  };

  if (!authReady || checkingAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-8 text-center space-y-3">
          <div className="w-10 h-10 rounded-full border-2 border-[#123c69] border-t-transparent animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-800">
            Verifying JCC Sondu Admin Session...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
          <div className="mb-6">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 mb-5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to JCC Sondu Website
            </a>
            <div className="w-11 h-11 rounded-lg bg-[#123c69]/10 text-[#123c69] flex items-center justify-center mb-4">
              <Lock className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              JCC Sondu Admin Portal
            </h1>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              Sign in with an authorized Google administrator account to manage congregant records, register admin numbers, and send mass SMS announcements.
            </p>
          </div>

          {authError && (
            <div className="mb-4 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {authError}
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label
                htmlFor="manual-google-email"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Admin Google Email (optional)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="manual-google-email"
                  type="email"
                  value={manualGoogleEmail}
                  onChange={(e) => setManualGoogleEmail(e.target.value)}
                  placeholder="e.g. jccsondusogoc@gmail.com"
                  autoComplete="email"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#123c69]/20 focus:border-[#123c69]"
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Key in your Google email manually to sign straight into that account, or leave blank to choose from Google.
              </p>
            </div>

            <button
              type="submit"
              disabled={signingIn}
              className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 text-sm font-medium text-white bg-[#123c69] rounded-lg hover:bg-[#092b4c] disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
            >
              <LogIn className="w-4 h-4" />
              <span>{signingIn ? 'Signing In...' : 'Sign in with Google'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
          <div className="w-11 h-11 rounded-lg bg-red-50 text-red-700 border border-red-200 flex items-center justify-center mb-4">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">
            Administrator Access Required
          </h1>
          <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
            The account{' '}
            <span className="font-medium text-slate-900">
              {user.email ?? user.uid}
            </span>{' '}
            is not authorized to view or modify JCC Sondu congregant records. An existing portal administrator can authorize this Google email under Admin Numbers.
          </p>
          {authError && (
            <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {authError}
            </p>
          )}
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#123c69] rounded-lg hover:bg-[#092b4c] transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Switch Account
            </button>
            <a
              href="/"
              className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Public Website
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar
        activeSection={activeSection}
        onSelect={setActiveSection}
        onSignOut={handleSignOut}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        congregantCount={congregants.length}
        adminNumberCount={adminNumbers.length}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          activeSection={activeSection}
          adminEmail={user.email ?? user.displayName ?? 'Admin'}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onOpenAddCongregant={() => {
            setEditingCongregant(null);
            setCongregantModalOpen(true);
          }}
          onGoToMassSms={() => setActiveSection('mass-sms')}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeSection === 'overview' && (
            <OverviewView
              congregants={congregants}
              adminNumbers={adminNumbers}
              campaigns={campaigns}
              smsConfig={smsConfig}
              loading={dataLoading}
              onNavigate={setActiveSection}
              onOpenAddCongregant={() => {
                setEditingCongregant(null);
                setCongregantModalOpen(true);
              }}
            />
          )}

          {activeSection === 'congregants' && (
            <CongregantsView
              congregants={congregants}
              loading={dataLoading}
              onAdd={() => {
                setEditingCongregant(null);
                setCongregantModalOpen(true);
              }}
              onEdit={(record) => {
                setEditingCongregant(record);
                setCongregantModalOpen(true);
              }}
              onDelete={deleteCongregant}
              onSendSmsToSelected={(ids) => {
                setPreselectedSmsIds(ids);
                setActiveSection('mass-sms');
              }}
            />
          )}

          {activeSection === 'mass-sms' && (
            <MassSmsView
              user={user}
              congregants={congregants}
              adminNumbers={adminNumbers}
              smsConfig={smsConfig}
              preselectedCongregantIds={preselectedSmsIds}
              onClearPreselection={() => setPreselectedSmsIds([])}
              onNavigate={setActiveSection}
            />
          )}

          {activeSection === 'admin-numbers' && (
            <AdminNumbersView
              user={user}
              adminNumbers={adminNumbers}
              admins={admins}
              adminEmails={adminEmails}
              loading={dataLoading}
            />
          )}

          {activeSection === 'campaigns' && (
            <CampaignHistoryView
              campaigns={campaigns}
              loading={dataLoading}
              onNavigate={setActiveSection}
            />
          )}
        </main>
      </div>

      <CongregantModal
        open={congregantModalOpen}
        editingRecord={editingCongregant}
        onClose={() => setCongregantModalOpen(false)}
        onSave={handleSaveCongregant}
      />
    </div>
  );
}

export default App;
