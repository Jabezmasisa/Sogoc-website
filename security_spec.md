# Security Specification — JCC Sondu (SOGOC) Admin Portal

## 1. Data Invariants
1. **Strict Admin-Only PII Isolation**: All collections (`/congregants`, `/congregantRegistrations`, `/automationSettings`, `/adminNumbers`, `/smsCampaigns`, `/smsCampaigns/{campaignId}/recipients`, `/adminEmails`, `/adminPassSessions`) contain sensitive or PII data. Unauthenticated users and non-admin signed-in users MUST be denied all `get`, `list`, `update`, and `delete` access (except a signed-in user checking their own `/admins/{uid}`, `/adminEmails/{email}`, or creating their own SHA-256 passcode-verified `/adminPassSessions/{uid}`). Public self-registration is strictly write-only (`create` on `/congregantRegistrations/{registrationId}` with `status == 'pending'`, empty reviewer fields, `welcomeSmsStatus == 'not_sent'`, and `request.time` timestamps) and cannot read, modify, or promote records into `/congregants`.
2. **Verified Admin Identity**: Admin status requires `request.auth != null` AND either `request.auth.token.email_verified == true` OR a valid `/adminPassSessions/{request.auth.uid}` created with the SHA-256 verified portal passcode, AND the account email/UID must be a bootstrapped admin email (`jabezpeter23@gmail.com`, `jccsondusogoc@gmail.com`), an existing `/admins/{request.auth.uid}` document, or an existing `/adminEmails/{request.auth.token.email.lower()}` document. Unverified accounts without a valid passcode session MUST be rejected.
3. **Immutable Ownership & Temporal Integrity**:
   - `createdAt` must equal `request.time` on creation and MUST remain immutable on update.
   - `createdBy` / `ownerUid` must equal `request.auth.uid` on creation and MUST remain immutable on update.
   - `updatedAt` must equal `request.time` on both creation and update.
4. **Strict Schema & Boundary Enforcement**: Every document must match the exact key allowlist (`hasAll` + `hasOnly`), type checks, enum values (`gender` in `['Male', 'Female', 'Other']`), E.164 phone regex (`^\\+[1-9][0-9]{6,14}$`), and string `.size()` bounds declared in `firebase-blueprint.json`.
5. **Path Variable Hardening**: Every document ID (`adminId`, `numberId`, `congregantId`, `registrationId`, `settingId`, `campaignId`, `recipientId`, `uid`) must pass `isValidId(id)` (`^[a-zA-Z0-9_\\-]+$` and `<= 128` chars) and every email document ID (`emailId` in `/adminEmails/{emailId}`) must pass `isValidEmailId(emailId)` on single-document operations.
6. **Master Gate & Campaign Immutability**: Subcollection `/smsCampaigns/{campaignId}/recipients/{recipientId}` requires the parent `/smsCampaigns/{campaignId}` document to exist (`exists(...)`), and campaign logs + recipient receipts are immutable audit records (no client-side `update` allowed after creation).

## 2. The "Dirty Dozen" Payloads (Expected: `PERMISSION_DENIED`)
1. **Unauthenticated Congregant & Registration Read**: Anonymous client attempts `getDoc(doc(db, 'congregants', 'c1'))`, `getDocs(collection(db, 'congregants'))`, or `getDocs(collection(db, 'congregantRegistrations'))`.
2. **Non-Admin Authenticated Congregant Read**: Signed-in verified user (`other@gmail.com`, not in `/admins`) attempts to read `/congregants/c1` or `/congregantRegistrations/r1` (PII Blanket Test).
3. **Email Spoofing Attack**: Signed-in user with `email: 'jabezpeter23@gmail.com'` and `email_verified: false` attempts to read or create `/congregants/c1`.
4. **Privilege Self-Escalation**: Non-admin user attempts `setDoc(doc(db, 'admins', auth.uid), { uid: auth.uid, email: 'attacker@example.com', displayName: 'Attacker', role: 'admin', ... })`.
5. **Self-Approval Escalation on Registration**: Anonymous or non-admin user attempts to create `/congregantRegistrations/r1` with `status: 'approved'` or `congregantId: 'c1'`, or update an existing pending registration.
6. **Shadow / Ghost Field Injection on Congregant Create**: Admin sends valid congregant fields plus an unexpected field `isVerified: true` or `balance: 999`.
7. **Invalid Gender Enum**: Client creates congregant or registration with `gender: 'Unknown'` (not in `['Male', 'Female', 'Other']`).
8. **Invalid Phone Number Format**: Client creates congregant, registration, or adminNumber with `phoneNumber: 'not-a-phone'` or exceeding 20 chars.
9. **Oversized Name / Message Poisoning**: Client creates congregant with `name` of 500 characters (`> 120`) or SMS campaign with `message` of 2,000 characters (`> 640`).
10. **Path Variable ID Poisoning**: Client attempts to create `/congregants/bad$id..with.chars` or an ID > 128 characters.
11. **Forged Timestamp Attack**: Client creates congregant or registration with backdated `createdAt: Timestamp.fromMillis(1000)` instead of `serverTimestamp()`.
12. **Immortal Field Tampering & Orphaned Recipient Write**: Admin updates `/congregants/c1` and tries to alter `createdAt` or `createdBy`, or creates `/smsCampaigns/missing_parent/recipients/r1` without an existing parent campaign.
