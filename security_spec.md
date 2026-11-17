# Security Specification — JCC Sondu (SOGOC) Admin Portal

## 1. Data Invariants
1. **Strict Admin-Only PII Isolation**: All collections (`/congregants`, `/adminNumbers`, `/smsCampaigns`, `/smsCampaigns/{campaignId}/recipients`, `/adminEmails`) contain Personally Identifiable Information (phone numbers, names, emails). Unauthenticated users and non-admin signed-in users MUST be denied all `get`, `list`, `create`, `update`, and `delete` access (except a verified signed-in user checking their own `/admins/{uid}` or `/adminEmails/{email}` membership).
2. **Verified Admin Identity**: Admin status requires `request.auth != null && request.auth.token.email_verified == true` AND either a bootstrapped admin email (`jabezpeter23@gmail.com`, `jccsondusogoc@gmail.com`), an existing `/admins/{request.auth.uid}` document, or an existing `/adminEmails/{request.auth.token.email.lower()}` document. Unverified emails MUST be rejected even if the email string matches.
3. **Immutable Ownership & Temporal Integrity**:
   - `createdAt` must equal `request.time` on creation and MUST remain immutable on update.
   - `createdBy` / `ownerUid` must equal `request.auth.uid` on creation and MUST remain immutable on update.
   - `updatedAt` must equal `request.time` on both creation and update.
4. **Strict Schema & Boundary Enforcement**: Every document must match the exact key allowlist (`hasAll` + `hasOnly`), type checks, enum values (`gender` in `['Male', 'Female', 'Other']`), E.164 phone regex (`^\\+[1-9][0-9]{6,14}$`), and string `.size()` bounds declared in `firebase-blueprint.json`.
5. **Path Variable Hardening**: Every document ID (`adminId`, `numberId`, `congregantId`, `campaignId`, `recipientId`) must pass `isValidId(id)` (`^[a-zA-Z0-9_\\-]+$` and `<= 128` chars) and every email document ID (`emailId` in `/adminEmails/{emailId}`) must pass `isValidEmailId(emailId)` on single-document operations.
6. **Master Gate & Campaign Immutability**: Subcollection `/smsCampaigns/{campaignId}/recipients/{recipientId}` requires the parent `/smsCampaigns/{campaignId}` document to exist (`exists(...)`), and campaign logs + recipient receipts are immutable audit records (no client-side `update` allowed after creation).

## 2. The "Dirty Dozen" Payloads (Expected: `PERMISSION_DENIED`)
1. **Unauthenticated Congregant Read**: Anonymous client attempts `getDoc(doc(db, 'congregants', 'c1'))` or `getDocs(collection(db, 'congregants'))`.
2. **Non-Admin Authenticated Congregant Read**: Signed-in verified user (`other@gmail.com`, not in `/admins`) attempts to read `/congregants/c1` (PII Blanket Test).
3. **Email Spoofing Attack**: Signed-in user with `email: 'jabezpeter23@gmail.com'` and `email_verified: false` attempts to read or create `/congregants/c1`.
4. **Privilege Self-Escalation**: Non-admin user attempts `setDoc(doc(db, 'admins', auth.uid), { uid: auth.uid, email: 'attacker@example.com', displayName: 'Attacker', role: 'admin', ... })`.
5. **Shadow / Ghost Field Injection on Congregant Create**: Admin sends valid congregant fields plus an unexpected field `isVerified: true` or `balance: 999`.
6. **Invalid Gender Enum**: Admin creates congregant with `gender: 'Unknown'` (not in `['Male', 'Female', 'Other']`).
7. **Invalid Phone Number Format**: Admin creates congregant or adminNumber with `phoneNumber: 'not-a-phone'` or exceeding 20 chars.
8. **Oversized Name / Message Poisoning**: Admin creates congregant with `name` of 500 characters (`> 120`) or SMS campaign with `message` of 2,000 characters (`> 640`).
9. **Path Variable ID Poisoning**: Admin attempts to create `/congregants/bad$id..with.chars` or an ID > 128 characters.
10. **Forged Timestamp Attack**: Admin creates congregant with backdated `createdAt: Timestamp.fromMillis(1000)` instead of `serverTimestamp()`.
11. **Immortal Field Tampering on Update**: Admin updates `/congregants/c1` and tries to alter `createdAt` or `createdBy`, or inject a ghost key during `updateDoc`.
12. **Orphaned Recipient Write / Audit Tampering**: Admin creates `/smsCampaigns/missing_parent/recipients/r1` without an existing parent campaign, or attempts to `update` an existing `/smsCampaigns/camp1` audit record.
