// Өрхийн хуулга. Мөрүүд RLS-ээр аль хэдийн шүүгдсэн байх ёстой.
// Энд дахин household_id-аар шүүж, өөр өрхийн мөр файлд орохгүй.

const GOAL_ACCOUNTS = new Set(['goal', 'savings', 'travel']);

function ownRows(rows, householdId) {
  return (rows || []).filter((row) => row && row.household_id === householdId);
}

export function buildHouseholdExport({
  householdId, household, members, incomes, expenses, transfers, exportedAt,
} = {}) {
  const keptTransfers = ownRows(transfers, householdId);
  return {
    exportedAt: exportedAt || new Date().toISOString(),
    householdId,
    household: household?.id === householdId ? household : null,
    members: ownRows(members, householdId),
    incomes: ownRows(incomes, householdId),
    expenses: ownRows(expenses, householdId),
    transfers: keptTransfers,
    goals: keptTransfers.filter((row) => GOAL_ACCOUNTS.has(row.account)),
  };
}

function cell(value) {
  if (value == null) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function tableCsv(name, rows) {
  const list = rows || [];
  const keys = [...new Set(list.flatMap((row) => Object.keys(row || {})))];
  const lines = [`# ${name}`, ['table', ...keys].join(',')];
  for (const row of list) lines.push([name, ...keys.map((key) => cell(row[key]))].join(','));
  return lines.join('\n');
}

export function toCsv(bundle) {
  const household = bundle.household ? [bundle.household] : [];
  return [
    tableCsv('household', household),
    tableCsv('members', bundle.members),
    tableCsv('incomes', bundle.incomes),
    tableCsv('expenses', bundle.expenses),
    tableCsv('transfers', bundle.transfers),
    tableCsv('goals', bundle.goals),
  ].join('\n');
}

export function exportFiles(bundle) {
  const day = String(bundle.exportedAt || '').slice(0, 10) || 'export';
  return [
    {
      name: `bidnii-sanhuu-${day}.json`,
      type: 'application/json;charset=utf-8',
      text: JSON.stringify(bundle, null, 2),
    },
    {
      name: `bidnii-sanhuu-${day}.csv`,
      type: 'text/csv;charset=utf-8',
      text: `\uFEFF${toCsv(bundle)}`,
    },
  ];
}

export function downloadFiles(files) {
  for (const file of files) {
    const blob = new Blob([file.text], { type: file.type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}
