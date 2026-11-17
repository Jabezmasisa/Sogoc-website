import type { Timestamp } from 'firebase/firestore';

export type Gender = 'Male' | 'Female' | 'Other';
export type TargetFilter = 'All' | 'Male' | 'Female' | 'Other' | 'Custom';
export type CampaignStatus = 'sent' | 'partial' | 'failed';
export type RecipientStatus = 'sent' | 'failed';

export type AdminNavSection =
  | 'overview'
  | 'congregants'
  | 'mass-sms'
  | 'admin-numbers'
  | 'campaigns';

export interface AdminUserRecord {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  role: 'admin';
  createdBy: string;
  createdAt: Timestamp | null;
}

export interface AdminEmailRecord {
  id: string;
  email: string;
  displayName: string;
  role: 'admin';
  createdBy: string;
  createdAt: Timestamp | null;
}

export interface AdminNumberRecord {
  id: string;
  label: string;
  phoneNumber: string;
  isDefault: boolean;
  ownerUid: string;
  ownerEmail: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface CongregantRecord {
  id: string;
  name: string;
  gender: Gender;
  phoneNumber: string;
  createdBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface SmsCampaignRecord {
  id: string;
  senderNumber: string;
  senderLabel: string;
  message: string;
  targetFilter: TargetFilter;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  status: CampaignStatus;
  provider: string;
  errorMessage: string;
  createdBy: string;
  createdByEmail: string;
  createdAt: Timestamp | null;
}

export interface SmsCampaignRecipientRecord {
  id: string;
  congregantId: string;
  congregantName: string;
  phoneNumber: string;
  status: RecipientStatus;
  providerMessageId: string;
  error: string;
  createdAt: Timestamp | null;
}

export interface SmsGatewayConfig {
  configured: boolean;
  provider: 'africastalking' | 'twilio' | null;
  senderHint: string | null;
}

export interface SmsDispatchResultItem {
  congregantId: string;
  congregantName: string;
  phoneNumber: string;
  status: RecipientStatus;
  providerMessageId: string;
  error: string;
}

export interface SmsDispatchResponse {
  ok: boolean;
  configured: boolean;
  provider: string;
  status: CampaignStatus;
  sentCount: number;
  failedCount: number;
  errorMessage: string;
  results: SmsDispatchResultItem[];
}
