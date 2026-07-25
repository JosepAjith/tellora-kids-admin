export const DEMO_EMAIL = 'admin@tellora.com';
export const DEMO_PASSWORD = 'TelloraAdmin123!';

export function getDemoAuthResult(email, password) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPassword = String(password || '');

  if (normalizedEmail === DEMO_EMAIL && normalizedPassword === DEMO_PASSWORD) {
    return {
      uid: 'demo-admin',
      email: DEMO_EMAIL,
      displayName: 'Demo Admin',
    };
  }

  return null;
}
