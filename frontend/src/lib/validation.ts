// Password policy shared by every form. Mirrors backend/lib/security.py —
// minimum 9 characters with uppercase, lowercase and a special character.
export function validatePasswordClient(password: string): string | null {
  if (password.length < 9) return "Password must be at least 9 characters long.";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include a special character.";
  return null;
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
