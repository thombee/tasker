// Local calendar day as "YYYY-MM-DD". Shared by traversal, journal, and the
// store so "today" means the same thing everywhere (and no circular import).
export function dayKey(timestamp: number): string {
  const d = new Date(timestamp);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}
