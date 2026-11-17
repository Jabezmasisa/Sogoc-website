export async function verifyAdminSecretPassword(
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/auth/verify-admin-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };

  if (!res.ok || !data.ok) {
    return {
      ok: false,
      error: data.error || 'Invalid email or secret password.',
    };
  }

  return { ok: true };
}
