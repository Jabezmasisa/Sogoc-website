import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  ADMIN_EMAIL_CONSTRAINTS,
  ADMIN_NUMBER_CONSTRAINTS,
  ADMIN_USER_CONSTRAINTS,
  CONGREGANT_CONSTRAINTS,
  isBootstrappedAdminEmail,
  isValidAdminEmailAddress,
  isValidPhoneNumber,
  normalizeEmail,
  normalizePhoneNumber,
  sanitizeBoundedText,
  sanitizeMessageText,
  SMS_CAMPAIGN_CONSTRAINTS,
} from '../blueprintConstraints';
import type {
  AdminEmailRecord,
  AdminNumberRecord,
  AdminUserRecord,
  CampaignStatus,
  CongregantRecord,
  Gender,
  SmsCampaignRecipientRecord,
  SmsCampaignRecord,
  SmsDispatchResultItem,
  TargetFilter,
} from '../types';

export async function hasAdminPassSession(uid: string): Promise<boolean> {
  const path = `adminPassSessions/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'adminPassSessions', uid));
    return snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function ensureAdminPassSession(
  user: User,
  passcode: string
): Promise<boolean> {
  const email = user.email ? normalizeEmail(user.email) : '';
  if (!email || !isValidAdminEmailAddress(email) || !passcode) {
    return false;
  }

  try {
    const existing = await getDoc(doc(db, 'adminPassSessions', user.uid));
    if (existing.exists()) {
      return true;
    }
    await setDoc(doc(db, 'adminPassSessions', user.uid), {
      uid: user.uid,
      email,
      passcode,
      createdAt: serverTimestamp(),
    });
    return true;
  } catch {
    return false;
  }
}

export async function verifyUserIsAdmin(user: User): Promise<boolean> {
  let verified = user.emailVerified;
  if (!verified) {
    verified = await hasAdminPassSession(user.uid);
  }
  if (!verified) {
    return false;
  }
  if (isBootstrappedAdminEmail(user.email)) {
    return true;
  }
  const uidPath = `admins/${user.uid}`;
  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    if (snap.exists()) {
      return true;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, uidPath);
  }

  const normalizedEmail = user.email ? normalizeEmail(user.email) : '';
  if (!normalizedEmail || !isValidAdminEmailAddress(normalizedEmail)) {
    return false;
  }

  const emailPath = `adminEmails/${normalizedEmail}`;
  try {
    const emailSnap = await getDoc(doc(db, 'adminEmails', normalizedEmail));
    return emailSnap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, emailPath);
  }
}

export function subscribeCongregants(
  onData: (items: CongregantRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'congregants';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const records: CongregantRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: String(data.name ?? ''),
          gender: (data.gender as Gender) ?? 'Other',
          phoneNumber: String(data.phoneNumber ?? ''),
          createdBy: String(data.createdBy ?? ''),
          createdAt: data.createdAt ?? null,
          updatedAt: data.updatedAt ?? null,
        };
      });
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function createCongregant(
  input: { name: string; gender: Gender; phoneNumber: string },
  adminUid: string
): Promise<string> {
  const name = sanitizeBoundedText(input.name, CONGREGANT_CONSTRAINTS.nameMax);
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);

  if (name.length < CONGREGANT_CONSTRAINTS.nameMin) {
    throw new Error('Congregant name is required.');
  }
  if (!CONGREGANT_CONSTRAINTS.genders.includes(input.gender)) {
    throw new Error('Select a valid gender (Male, Female, or Other).');
  }
  if (!isValidPhoneNumber(phoneNumber)) {
    throw new Error('Enter a valid phone number (e.g., 0722627135 or +254722627135).');
  }

  const path = 'congregants';
  try {
    const ref = await addDoc(collection(db, path), {
      name,
      gender: input.gender,
      phoneNumber,
      createdBy: adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCongregant(
  id: string,
  input: { name: string; gender: Gender; phoneNumber: string }
): Promise<void> {
  const name = sanitizeBoundedText(input.name, CONGREGANT_CONSTRAINTS.nameMax);
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);

  if (name.length < CONGREGANT_CONSTRAINTS.nameMin) {
    throw new Error('Congregant name is required.');
  }
  if (!CONGREGANT_CONSTRAINTS.genders.includes(input.gender)) {
    throw new Error('Select a valid gender.');
  }
  if (!isValidPhoneNumber(phoneNumber)) {
    throw new Error('Enter a valid phone number (e.g., 0722627135 or +254722627135).');
  }

  const path = `congregants/${id}`;
  try {
    await updateDoc(doc(db, 'congregants', id), {
      name,
      gender: input.gender,
      phoneNumber,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCongregant(id: string): Promise<void> {
  const path = `congregants/${id}`;
  try {
    await deleteDoc(doc(db, 'congregants', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeAdminNumbers(
  onData: (items: AdminNumberRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'adminNumbers';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const records: AdminNumberRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          label: String(data.label ?? ''),
          phoneNumber: String(data.phoneNumber ?? ''),
          isDefault: Boolean(data.isDefault),
          ownerUid: String(data.ownerUid ?? ''),
          ownerEmail: String(data.ownerEmail ?? ''),
          createdAt: data.createdAt ?? null,
          updatedAt: data.updatedAt ?? null,
        };
      });
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function createAdminNumber(
  input: { label: string; phoneNumber: string; isDefault: boolean },
  user: User,
  existingNumbers: AdminNumberRecord[]
): Promise<string> {
  const label = sanitizeBoundedText(input.label, ADMIN_NUMBER_CONSTRAINTS.labelMax);
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);

  if (label.length < ADMIN_NUMBER_CONSTRAINTS.labelMin) {
    throw new Error('Number label is required (e.g., Pastor Office Line).');
  }
  if (!isValidPhoneNumber(phoneNumber)) {
    throw new Error('Enter a valid phone number (e.g., 0722627135 or +254722627135).');
  }
  const email = (user.email ?? '').slice(0, ADMIN_USER_CONSTRAINTS.emailMax);
  if (!email) {
    throw new Error('Verified admin email is required.');
  }

  const shouldBeDefault = input.isDefault || existingNumbers.length === 0;
  const path = 'adminNumbers';

  try {
    const batch = writeBatch(db);
    if (shouldBeDefault) {
      for (const existing of existingNumbers) {
        if (existing.isDefault) {
          batch.update(doc(db, 'adminNumbers', existing.id), {
            isDefault: false,
            updatedAt: serverTimestamp(),
          });
        }
      }
    }
    const newRef = doc(collection(db, path));
    batch.set(newRef, {
      label,
      phoneNumber,
      isDefault: shouldBeDefault,
      ownerUid: user.uid,
      ownerEmail: email,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return newRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function setDefaultAdminNumber(
  targetId: string,
  allNumbers: AdminNumberRecord[]
): Promise<void> {
  const path = `adminNumbers/${targetId}`;
  try {
    const batch = writeBatch(db);
    for (const item of allNumbers) {
      const nextDefault = item.id === targetId;
      if (item.isDefault !== nextDefault) {
        batch.update(doc(db, 'adminNumbers', item.id), {
          isDefault: nextDefault,
          updatedAt: serverTimestamp(),
        });
      }
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateAdminNumber(
  id: string,
  input: { label: string; phoneNumber: string }
): Promise<void> {
  const label = sanitizeBoundedText(input.label, ADMIN_NUMBER_CONSTRAINTS.labelMax);
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);

  if (label.length < ADMIN_NUMBER_CONSTRAINTS.labelMin) {
    throw new Error('Label is required.');
  }
  if (!isValidPhoneNumber(phoneNumber)) {
    throw new Error('Enter a valid phone number.');
  }

  const path = `adminNumbers/${id}`;
  try {
    await updateDoc(doc(db, 'adminNumbers', id), {
      label,
      phoneNumber,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAdminNumber(id: string): Promise<void> {
  const path = `adminNumbers/${id}`;
  try {
    await deleteDoc(doc(db, 'adminNumbers', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeSmsCampaigns(
  onData: (items: SmsCampaignRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'smsCampaigns';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const records: SmsCampaignRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          senderNumber: String(data.senderNumber ?? ''),
          senderLabel: String(data.senderLabel ?? ''),
          message: String(data.message ?? ''),
          targetFilter: (data.targetFilter as TargetFilter) ?? 'All',
          recipientCount: Number(data.recipientCount ?? 0),
          sentCount: Number(data.sentCount ?? 0),
          failedCount: Number(data.failedCount ?? 0),
          status: (data.status as CampaignStatus) ?? 'failed',
          provider: String(data.provider ?? 'unconfigured'),
          errorMessage: String(data.errorMessage ?? ''),
          createdBy: String(data.createdBy ?? ''),
          createdByEmail: String(data.createdByEmail ?? ''),
          createdAt: data.createdAt ?? null,
        };
      });
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function logSmsCampaign(params: {
  senderNumber: string;
  senderLabel: string;
  message: string;
  targetFilter: TargetFilter;
  sentCount: number;
  failedCount: number;
  status: CampaignStatus;
  provider: string;
  errorMessage: string;
  results: SmsDispatchResultItem[];
  user: User;
}): Promise<string> {
  const senderNumber = normalizePhoneNumber(params.senderNumber);
  const senderLabel = sanitizeBoundedText(
    params.senderLabel || 'Admin Line',
    SMS_CAMPAIGN_CONSTRAINTS.senderLabelMax
  );
  const message = sanitizeMessageText(params.message, SMS_CAMPAIGN_CONSTRAINTS.messageMax);
  const provider = sanitizeBoundedText(
    params.provider || 'unconfigured',
    SMS_CAMPAIGN_CONSTRAINTS.providerMax
  );
  const errorMessage = sanitizeBoundedText(
    params.errorMessage || '',
    SMS_CAMPAIGN_CONSTRAINTS.errorMax
  );
  const recipientCount = params.results.length;
  const email = (params.user.email ?? '').slice(0, ADMIN_USER_CONSTRAINTS.emailMax);

  if (!isValidPhoneNumber(senderNumber)) {
    throw new Error('Valid admin sender number is required.');
  }
  if (!message || recipientCount === 0) {
    throw new Error('Message and at least one recipient are required.');
  }

  const campaignRef = doc(collection(db, 'smsCampaigns'));
  const path = `smsCampaigns/${campaignRef.id}`;

  try {
    await setDoc(campaignRef, {
      senderNumber,
      senderLabel,
      message,
      targetFilter: params.targetFilter,
      recipientCount,
      sentCount: params.sentCount,
      failedCount: params.failedCount,
      status: params.status,
      provider,
      errorMessage,
      createdBy: params.user.uid,
      createdByEmail: email,
      createdAt: serverTimestamp(),
    });

    // Write recipient subcollection records in batches of 400 (parent exists first)
    const CHUNK_SIZE = 400;
    for (let i = 0; i < params.results.length; i += CHUNK_SIZE) {
      const chunk = params.results.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const item of chunk) {
        const recRef = doc(collection(db, 'smsCampaigns', campaignRef.id, 'recipients'));
        batch.set(recRef, {
          congregantId: item.congregantId.slice(0, ADMIN_USER_CONSTRAINTS.uidMax),
          congregantName: sanitizeBoundedText(
            item.congregantName,
            CONGREGANT_CONSTRAINTS.nameMax
          ),
          phoneNumber: normalizePhoneNumber(item.phoneNumber),
          status: item.status,
          providerMessageId: (item.providerMessageId || '').slice(
            0,
            SMS_CAMPAIGN_CONSTRAINTS.recipientMessageIdMax
          ),
          error: sanitizeBoundedText(
            item.error || '',
            SMS_CAMPAIGN_CONSTRAINTS.recipientErrorMax
          ),
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }

    return campaignRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchCampaignRecipients(
  campaignId: string
): Promise<SmsCampaignRecipientRecord[]> {
  const path = `smsCampaigns/${campaignId}/recipients`;
  try {
    const snap = await getDocs(collection(db, 'smsCampaigns', campaignId, 'recipients'));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        congregantId: String(data.congregantId ?? ''),
        congregantName: String(data.congregantName ?? ''),
        phoneNumber: String(data.phoneNumber ?? ''),
        status: data.status === 'sent' ? 'sent' : 'failed',
        providerMessageId: String(data.providerMessageId ?? ''),
        error: String(data.error ?? ''),
        createdAt: data.createdAt ?? null,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export function subscribeAdmins(
  onData: (items: AdminUserRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'admins';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const records: AdminUserRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          uid: String(data.uid ?? d.id),
          email: String(data.email ?? ''),
          displayName: String(data.displayName ?? ''),
          role: 'admin',
          createdBy: String(data.createdBy ?? ''),
          createdAt: data.createdAt ?? null,
        };
      });
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeAdminEmails(
  onData: (items: AdminEmailRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = 'adminEmails';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const records: AdminEmailRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          email: String(data.email ?? d.id),
          displayName: String(data.displayName ?? ''),
          role: 'admin',
          createdBy: String(data.createdBy ?? ''),
          createdAt: data.createdAt ?? null,
        };
      });
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function createAdminEmail(
  input: { email: string; displayName: string },
  adminUser: User
): Promise<string> {
  const email = normalizeEmail(input.email);
  if (!isValidAdminEmailAddress(email)) {
    throw new Error('Enter a valid Google email address (e.g., name@gmail.com).');
  }
  if (isBootstrappedAdminEmail(email)) {
    throw new Error(`${email} is already a primary administrator.`);
  }

  const fallbackName = email.split('@')[0] || 'Administrator';
  const displayName = sanitizeBoundedText(
    input.displayName || fallbackName,
    ADMIN_EMAIL_CONSTRAINTS.displayNameMax
  );
  if (displayName.length < ADMIN_EMAIL_CONSTRAINTS.displayNameMin) {
    throw new Error('Enter a name or role label for this administrator.');
  }

  const path = `adminEmails/${email}`;
  try {
    const existing = await getDoc(doc(db, 'adminEmails', email));
    if (existing.exists()) {
      throw new Error(`${email} is already authorized as an administrator.`);
    }
    await setDoc(doc(db, 'adminEmails', email), {
      email,
      displayName,
      role: 'admin',
      createdBy: adminUser.uid,
      createdAt: serverTimestamp(),
    });
    return email;
  } catch (error) {
    if (error instanceof Error && error.message.includes('already authorized')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteAdminEmail(emailId: string): Promise<void> {
  const normalized = normalizeEmail(emailId);
  const path = `adminEmails/${normalized}`;
  try {
    await deleteDoc(doc(db, 'adminEmails', normalized));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
