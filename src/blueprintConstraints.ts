import blueprint from '../firebase-blueprint.json';
import type { Gender, TargetFilter } from './types';

const { entities } = blueprint;

export const BOOTSTRAPPED_ADMIN_EMAILS = [
  'jabezpeter23@gmail.com',
  'jccsondusogoc@gmail.com',
] as const;

export function isBootstrappedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return (BOOTSTRAPPED_ADMIN_EMAILS as readonly string[]).includes(
    email.trim().toLowerCase()
  );
}

export const ADMIN_USER_CONSTRAINTS = {
  uidMax: entities.AdminUser.properties.uid.maxLength,
  emailMax: entities.AdminUser.properties.email.maxLength,
  displayNameMax: entities.AdminUser.properties.displayName.maxLength,
  idPattern: new RegExp(entities.AdminUser.properties.uid.pattern),
} as const;

export const ADMIN_NUMBER_CONSTRAINTS = {
  labelMin: entities.AdminNumber.properties.label.minLength,
  labelMax: entities.AdminNumber.properties.label.maxLength,
  phoneMin: entities.AdminNumber.properties.phoneNumber.minLength,
  phoneMax: entities.AdminNumber.properties.phoneNumber.maxLength,
  phonePattern: new RegExp(entities.AdminNumber.properties.phoneNumber.pattern),
} as const;

export const CONGREGANT_CONSTRAINTS = {
  nameMin: entities.Congregant.properties.name.minLength,
  nameMax: entities.Congregant.properties.name.maxLength,
  genders: entities.Congregant.properties.gender.enum as Gender[],
  phoneMin: entities.Congregant.properties.phoneNumber.minLength,
  phoneMax: entities.Congregant.properties.phoneNumber.maxLength,
  phonePattern: new RegExp(entities.Congregant.properties.phoneNumber.pattern),
} as const;

export const SMS_CAMPAIGN_CONSTRAINTS = {
  messageMin: entities.SmsCampaign.properties.message.minLength,
  messageMax: entities.SmsCampaign.properties.message.maxLength,
  senderLabelMax: entities.SmsCampaign.properties.senderLabel.maxLength,
  providerMax: entities.SmsCampaign.properties.provider.maxLength,
  errorMax: entities.SmsCampaign.properties.errorMessage.maxLength,
  recipientErrorMax: entities.SmsCampaignRecipient.properties.error.maxLength,
  recipientMessageIdMax: entities.SmsCampaignRecipient.properties.providerMessageId.maxLength,
  targetFilters: entities.SmsCampaign.properties.targetFilter.enum as TargetFilter[],
} as const;

/**
 * Normalizes Kenyan local numbers (e.g. 0722627135, 0112345678, 254722627135)
 * or international numbers into strict E.164 format (+[country][number]).
 */
export function normalizePhoneNumber(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  let normalized = '';
  if (hasPlus) {
    normalized = `+${digits}`;
  } else if (digits.startsWith('0') && digits.length === 10) {
    // Kenyan local format 07xxxxxxxx / 01xxxxxxxx -> +254...
    normalized = `+254${digits.slice(1)}`;
  } else if (digits.startsWith('254') && digits.length === 12) {
    normalized = `+${digits}`;
  } else {
    normalized = `+${digits}`;
  }

  return normalized.slice(0, CONGREGANT_CONSTRAINTS.phoneMax);
}

export function isValidPhoneNumber(normalized: string): boolean {
  return (
    normalized.length >= CONGREGANT_CONSTRAINTS.phoneMin &&
    normalized.length <= CONGREGANT_CONSTRAINTS.phoneMax &&
    CONGREGANT_CONSTRAINTS.phonePattern.test(normalized)
  );
}

export function sanitizeBoundedText(input: string, maxLength: number): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function sanitizeMessageText(input: string, maxLength: number): string {
  return input.trim().slice(0, maxLength);
}

export function formatPhoneDisplay(e164: string): string {
  if (e164.startsWith('+254') && e164.length === 13) {
    return `+254 ${e164.slice(4, 7)} ${e164.slice(7, 10)} ${e164.slice(10)}`;
  }
  return e164;
}

export function calculateSmsSegments(text: string): {
  length: number;
  segments: number;
  encoding: 'GSM-7' | 'Unicode';
  perSegment: number;
} {
  const length = text.length;
  const isGsm7 = /^[\x20-\x7E\r\n£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¤¡ÄÖÑÜ§¿äöñüà]*$/.test(text);
  const singleLimit = isGsm7 ? 160 : 70;
  const multiLimit = isGsm7 ? 153 : 67;
  if (length === 0) {
    return { length: 0, segments: 0, encoding: isGsm7 ? 'GSM-7' : 'Unicode', perSegment: singleLimit };
  }
  const segments = length <= singleLimit ? 1 : Math.ceil(length / multiLimit);
  return {
    length,
    segments,
    encoding: isGsm7 ? 'GSM-7' : 'Unicode',
    perSegment: length <= singleLimit ? singleLimit : multiLimit,
  };
}
