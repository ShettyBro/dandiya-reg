export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  let str = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(",");
  const lines = rows.map((row) => columns.map((col) => escapeCsvField(row[col])).join(","));
  return [header, ...lines].join("\n");
}
