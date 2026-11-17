/**
 * Firestore Security Rules TDD Specification ("Dirty Dozen" Verification Suite)
 * Designed for @firebase/rules-unit-testing against firestore.rules.
 */
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

const ADMIN_EMAIL = 'jabezpeter23@gmail.com';

export async function runDirtyDozenSuite() {
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: 'sogoc-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });

  const adminCtx = testEnv.authenticatedContext('admin-uid-1', {
    email: ADMIN_EMAIL,
    email_verified: true,
  });
  const unverifiedSpoofCtx = testEnv.authenticatedContext('spoof-uid', {
    email: ADMIN_EMAIL,
    email_verified: false,
  });
  const nonAdminCtx = testEnv.authenticatedContext('user-uid-2', {
    email: 'visitor@example.com',
    email_verified: true,
  });
  const unauthCtx = testEnv.unauthenticatedContext();

  try {
    // Seed a baseline congregant and campaign as admin
    await assertSucceeds(
      setDoc(doc(adminCtx.firestore(), 'congregants', 'cong_1'), {
        name: 'Grace Atieno',
        gender: 'Female',
        phoneNumber: '+254722627135',
        createdBy: 'admin-uid-1',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 1. Unauthenticated Congregant Read
    await assertFails(getDoc(doc(unauthCtx.firestore(), 'congregants', 'cong_1')));
    await assertFails(getDocs(collection(unauthCtx.firestore(), 'congregants')));

    // 2. Non-Admin Authenticated Congregant Read
    await assertFails(getDoc(doc(nonAdminCtx.firestore(), 'congregants', 'cong_1')));

    // 3. Email Spoofing Attack (email_verified: false)
    await assertFails(getDoc(doc(unverifiedSpoofCtx.firestore(), 'congregants', 'cong_1')));
    await assertFails(
      setDoc(doc(unverifiedSpoofCtx.firestore(), 'congregants', 'cong_spoof'), {
        name: 'Spoof',
        gender: 'Male',
        phoneNumber: '+254722000001',
        createdBy: 'spoof-uid',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 4. Privilege Self-Escalation
    await assertFails(
      setDoc(doc(nonAdminCtx.firestore(), 'admins', 'user-uid-2'), {
        uid: 'user-uid-2',
        email: 'visitor@example.com',
        displayName: 'Visitor',
        role: 'admin',
        createdBy: 'user-uid-2',
        createdAt: serverTimestamp(),
      })
    );

    // 5. Shadow / Ghost Field Injection on Create
    await assertFails(
      setDoc(doc(adminCtx.firestore(), 'congregants', 'cong_ghost'), {
        name: 'Peter Otieno',
        gender: 'Male',
        phoneNumber: '+254722000002',
        createdBy: 'admin-uid-1',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isVerified: true,
      })
    );

    // 6. Invalid Gender Enum
    await assertFails(
      setDoc(doc(adminCtx.firestore(), 'congregants', 'cong_gender'), {
        name: 'Peter Otieno',
        gender: 'Unknown',
        phoneNumber: '+254722000002',
        createdBy: 'admin-uid-1',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 7. Invalid Phone Number Format
    await assertFails(
      setDoc(doc(adminCtx.firestore(), 'congregants', 'cong_phone'), {
        name: 'Peter Otieno',
        gender: 'Male',
        phoneNumber: 'not-a-phone',
        createdBy: 'admin-uid-1',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 8. Oversized Name Poisoning
    await assertFails(
      setDoc(doc(adminCtx.firestore(), 'congregants', 'cong_long'), {
        name: 'A'.repeat(200),
        gender: 'Male',
        phoneNumber: '+254722000003',
        createdBy: 'admin-uid-1',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 9. Path Variable ID Poisoning
    await assertFails(
      setDoc(doc(adminCtx.firestore(), 'congregants', 'bad$id.chars'), {
        name: 'Bad Id',
        gender: 'Male',
        phoneNumber: '+254722000004',
        createdBy: 'admin-uid-1',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 10. Forged Timestamp Attack
    await assertFails(
      setDoc(doc(adminCtx.firestore(), 'congregants', 'cong_time'), {
        name: 'Backdated',
        gender: 'Female',
        phoneNumber: '+254722000005',
        createdBy: 'admin-uid-1',
        createdAt: Timestamp.fromMillis(1000),
        updatedAt: serverTimestamp(),
      })
    );

    // 11. Immortal Field Tampering on Update
    await assertFails(
      updateDoc(doc(adminCtx.firestore(), 'congregants', 'cong_1'), {
        name: 'Grace Atieno Updated',
        createdBy: 'someone-else',
        updatedAt: serverTimestamp(),
      })
    );

    // 12. Orphaned Recipient Write & Campaign Audit Tampering
    await assertFails(
      setDoc(doc(adminCtx.firestore(), 'smsCampaigns', 'missing_parent', 'recipients', 'rec_1'), {
        congregantId: 'cong_1',
        congregantName: 'Grace Atieno',
        phoneNumber: '+254722627135',
        status: 'sent',
        providerMessageId: 'msg-1',
        error: '',
        createdAt: serverTimestamp(),
      })
    );

    // Verify valid admin update & delete succeed
    await assertSucceeds(
      updateDoc(doc(adminCtx.firestore(), 'congregants', 'cong_1'), {
        name: 'Grace Atieno Ochieng',
        updatedAt: serverTimestamp(),
      })
    );
    await assertSucceeds(deleteDoc(doc(adminCtx.firestore(), 'congregants', 'cong_1')));
  } finally {
    await testEnv.cleanup();
  }
}
