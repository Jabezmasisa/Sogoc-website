import type { User } from 'firebase/auth';
import type { SmsDispatchResponse, SmsGatewayConfig } from '../types';

export async function fetchSmsGatewayConfig(): Promise<SmsGatewayConfig> {
  const response = await fetch('/api/sms/config', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    return { configured: false, provider: null, senderHint: null };
  }
  return (await response.json()) as SmsGatewayConfig;
}

export async function dispatchMassSms(params: {
  user: User;
  senderNumber: string;
  message: string;
  recipients: Array<{ id: string; name: string; phoneNumber: string }>;
}): Promise<SmsDispatchResponse> {
  const idToken = await params.user.getIdToken();
  const response = await fetch('/api/sms/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      senderNumber: params.senderNumber,
      message: params.message,
      recipients: params.recipients,
    }),
  });

  const data = (await response.json()) as SmsDispatchResponse;
  return data;
}
