import { useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  Mail,
  ShieldAlert,
} from 'lucide-react';
import firebaseConfig from '../firebase-applet-config.json';
import { auth, googleProvider } from './firebase';
import { isValidAdminEmailAddress, normalizeEmail } from './blueprintConstraints';
import {
  createCongregant,
  deleteCongregant,
  ensureAdminPassSession,
  subscribeAdminEmails,
  subscribeAdminNumbers,
  subscribeAdmins,
  subscribeCongregants,
  subscribeSmsCampaigns,
  updateCongregant,
  verifyUserIsAdmin,
} from './services/firestoreService';
import { verifyAdminSecretPassword } from './services/authApi';
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
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [unauthorizedHost, setUnauthorizedHost] = useState<string | null>(null);
  const [emailProviderDisabled, setEmailProviderDisabled] = useState(false);
  const [emailAlreadyInUse, setEmailAlreadyInUse] = useState(false);
  const [copiedHost, setCopiedHost] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authMode, setAuthMode] = useState<'password' | 'google'>('password');
  const [manualGoogleEmail, setManualGoogleEmail] = useState('');
  const [passwordEmail, setPasswordEmail] = useState('');
  const [secretPassword, setSecretPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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

  const passwordSignInInProgressRef = useRef(false);

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

      if (passwordSignInInProgressRef.current) {
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
    setAuthNotice(null);
    setUnauthorizedHost(null);
    setEmailProviderDisabled(false);
    setEmailAlreadyInUse(false);

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
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code ?? '')
          : '';
      const message = err instanceof Error ? err.message : 'Google Sign-In did not complete.';

      if (code === 'auth/unauthorized-domain' || message.includes('auth/unauthorized-domain')) {
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        setUnauthorizedHost(host || 'this domain');
        setAuthError(
          `This domain (${host || 'current host'}) is not yet listed in Firebase Authorized Domains.`
        );
      } else if (code === 'auth/popup-blocked') {
        setAuthError(
          'Your browser blocked the Google Sign-In popup. Please allow popups for this site and try again.'
        );
      } else if (code === 'auth/popup-closed-by-user') {
        setAuthError('Google Sign-In window was closed before signing in.');
      } else {
        setAuthError(message);
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);
    setUnauthorizedHost(null);
    setEmailProviderDisabled(false);
    setEmailAlreadyInUse(false);

    const email = normalizeEmail(passwordEmail);
    if (!isValidAdminEmailAddress(email)) {
      setAuthError('Enter a valid administrator email address.');
      return;
    }
    if (!secretPassword) {
      setAuthError('Enter the admin secret password.');
      return;
    }

    const gateCheck = await verifyAdminSecretPassword(email, secretPassword);
    if (!gateCheck.ok) {
      setAuthError(gateCheck.error || 'Invalid administrator email or secret password.');
      return;
    }

    passwordSignInInProgressRef.current = true;
    setSigningIn(true);
    try {
      let signedInUser: User | null = null;
      try {
        const cred = await signInWithEmailAndPassword(auth, email, secretPassword);
        signedInUser = cred.user;
      } catch (signInErr) {
        const signInCode =
          typeof signInErr === 'object' && signInErr !== null && 'code' in signInErr
            ? String((signInErr as { code?: unknown }).code ?? '')
            : '';

        if (
          signInCode === 'auth/operation-not-allowed' ||
          signInCode === 'auth/configuration-not-found'
        ) {
          setEmailProviderDisabled(true);
          setAuthError('Email/Password sign-in is not enabled yet in your Firebase project.');
          return;
        }

        if (
          signInCode === 'auth/user-not-found' ||
          signInCode === 'auth/invalid-credential' ||
          signInCode === 'auth/wrong-password'
        ) {
          try {
            const createCred = await createUserWithEmailAndPassword(auth, email, secretPassword);
            signedInUser = createCred.user;
          } catch (createErr) {
            const createCode =
              typeof createErr === 'object' && createErr !== null && 'code' in createErr
                ? String((createErr as { code?: unknown }).code ?? '')
                : '';

            if (
              createCode === 'auth/operation-not-allowed' ||
              createCode === 'auth/configuration-not-found'
            ) {
              setEmailProviderDisabled(true);
              setAuthError('Email/Password sign-in is not enabled yet in your Firebase project.');
              return;
            }
            if (createCode === 'auth/email-already-in-use') {
              setEmailAlreadyInUse(true);
              setAuthError(
                `${email} was previously registered via Google Sign-In without a password.`
              );
              return;
            }
            throw createErr;
          }
        } else {
          throw signInErr;
        }
      }

      if (signedInUser) {
        if (!signedInUser.emailVerified) {
          await ensureAdminPassSession(signedInUser, secretPassword);
        }
        const authorized = await verifyUserIsAdmin(signedInUser);
        setIsAdmin(authorized);
        if (!authorized) {
          setAuthError(
            `${email} is not authorized as a JCC Sondu administrator yet. Ask a primary administrator to authorize it under Admin Numbers.`
          );
        }
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      passwordSignInInProgressRef.current = false;
      setCheckingAdmin(false);
      setSigningIn(false);
    }
  };

  const handlePasswordReset = async () => {
    setAuthError(null);
    setAuthNotice(null);
    const email = normalizeEmail(passwordEmail);
    if (!isValidAdminEmailAddress(email)) {
      setAuthError('Enter your administrator email address above before requesting password setup.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setEmailAlreadyInUse(false);
      setAuthNotice(
        `Password setup email sent to ${email}. Open the link, set @JCCSondu2026 as your password, then sign in right here.`
      );
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Unable to send password setup email.'
      );
    }
  };

  const handleCopyHost = async () => {
    if (!unauthorizedHost || typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(unauthorizedHost);
    setCopiedHost(true);
    setTimeout(() => setCopiedHost(false), 2000);
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

  if (!authReady || (checkingAdmin && !signingIn)) {
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

  if (!user || signingIn) {
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
              Sign in with an authorized administrator email and secret password, or use your Google administrator account.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg mb-5">
            <button
              type="button"
              onClick={() => {
                setAuthMode('password');
                setAuthError(null);
                setAuthNotice(null);
                setUnauthorizedHost(null);
              }}
              className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                authMode === 'password'
                  ? 'bg-white text-[#123c69] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Email & Password
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('google');
                setAuthError(null);
                setAuthNotice(null);
                setEmailProviderDisabled(false);
              }}
              className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                authMode === 'google'
                  ? 'bg-white text-[#123c69] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Google Sign-In
            </button>
          </div>

          {authNotice && (
            <div className="mb-4 p-3.5 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg">
              {authNotice}
            </div>
          )}

          {authError && (
            <div className="mb-4 p-3.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg space-y-2.5">
              <p>{authError}</p>
              {unauthorizedHost && (
                <div className="pt-2 border-t border-red-200 text-xs text-slate-700 space-y-2">
                  <p>
                    Add <span className="font-mono font-semibold text-slate-900">{unauthorizedHost}</span> in Firebase Console under{' '}
                    <span className="font-medium">Authentication → Settings → Authorized domains</span>:
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyHost}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer"
                    >
                      {copiedHost ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedHost ? 'Copied domain' : `Copy ${unauthorizedHost}`}</span>
                    </button>
                    <a
                      href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-[#123c69] rounded-md hover:bg-[#092b4c]"
                    >
                      <span>Open Firebase Auth Settings</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              )}
              {emailProviderDisabled && (
                <div className="pt-2 border-t border-red-200 text-xs text-slate-700 space-y-2">
                  <p>
                    Enable <span className="font-medium">Email/Password</span> under{' '}
                    <span className="font-medium">Authentication → Sign-in method</span> in Firebase Console:
                  </p>
                  <a
                    href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-[#123c69] rounded-md hover:bg-[#092b4c]"
                  >
                    <span>Enable Email/Password Provider</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
              {emailAlreadyInUse && (
                <div className="pt-2 border-t border-red-200 text-xs text-slate-700 space-y-2">
                  <p>
                    Send a one-click password setup email so you can sign in with this email and <span className="font-mono font-medium">@JCCSondu2026</span> without Google Sign-In:
                  </p>
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#123c69] rounded-md hover:bg-[#092b4c] cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Send Password Setup Email</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {authMode === 'password' ? (
            <form onSubmit={handlePasswordSignIn} className="space-y-4">
              <div>
                <label
                  htmlFor="admin-password-email"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Admin Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="admin-password-email"
                    type="email"
                    value={passwordEmail}
                    onChange={(e) => setPasswordEmail(e.target.value)}
                    placeholder="e.g. jabezpeter23@gmail.com"
                    autoComplete="email"
                    required
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#123c69]/20 focus:border-[#123c69]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="admin-secret-password"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Secret Password
                  </label>
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    className="text-xs font-medium text-[#123c69] hover:underline cursor-pointer"
                  >
                    Reset Password
                  </button>
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="admin-secret-password"
                    type={showPassword ? 'text' : 'password'}
                    value={secretPassword}
                    onChange={(e) => setSecretPassword(e.target.value)}
                    placeholder="Enter admin secret password"
                    autoComplete="current-password"
                    required
                    className="w-full pl-10 pr-10 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#123c69]/20 focus:border-[#123c69]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={signingIn}
                className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 text-sm font-medium text-white bg-[#123c69] rounded-lg hover:bg-[#092b4c] disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
              >
                <LogIn className="w-4 h-4" />
                <span>{signingIn ? 'Signing In...' : 'Sign in with Secret Password'}</span>
              </button>
            </form>
          ) : (
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
          )}
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
