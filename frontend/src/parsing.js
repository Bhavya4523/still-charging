function parseCsvTable(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell.trim()); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(cell.trim()); cell = '';
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

function parseDate(value) {
  const raw = String(value || '').trim();
  let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) return validDate(+match[1], +match[2], +match[3]);
  match = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (match) {
    let year = +match[3];
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return validDate(year, +match[2], +match[1]); // Indian exports are commonly DD/MM/YYYY.
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

function parseMoney(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const number = Number(raw.replace(/[₹,$\s]/g, '').replace(/\((.*)\)/, '-$1').replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
}

function findColumn(headers, names) {
  return headers.findIndex(header => names.some(name => header === name || header.includes(name)));
}

export function normalizeMerchant(value) {
  let normalized = String(value || '').toLowerCase()
    .replace(/\b(card|debit|credit|upi|pos|purchase|payment|transaction|txn|ref|reference|mandate|autopay|recurring|online|international)\b/g, ' ')
    .replace(/\b(?:xx|x{2,})\d*\b/g, ' ')
    .replace(/\b(?:via|through)\s+(?:razorpay|paytm|phonepe|googlepay|gpay|cashfree)\b/g, ' ')
    .replace(/\b(?:razorpay|paytm|phonepe|googlepay|gpay|cashfree)\b/g, ' ')
    .replace(/\b(?:com|in|co|www)\b/g, ' ')
    .replace(/[0-9*#@._/\\-]+/g, ' ').replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const aliases = [
    [/\bnetflix(?: subscription)?\b/, 'netflix'], [/\bspotify premium\b/, 'spotify'],
    [/\bgoogle one(?: \d+gb)?\b/, 'google one'], [/\bprime video\b/, 'prime video'],
    [/\bdisney hotstar\b/, 'hotstar'], [/\byoutube premium\b/, 'youtube premium']
  ];
  for (const [pattern, canonical] of aliases) if (pattern.test(normalized)) return canonical;
  return normalized;
}

function parseCsv(text) {
  const table = parseCsvTable(text);
  if (table.length < 2) throw new Error('This CSV does not contain transaction rows.');
  const headers = table[0].map(value => value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim());
  const dateColumn = findColumn(headers, ['date', 'transaction date', 'value date', 'posting date']);
  const descriptionColumn = findColumn(headers, ['description', 'narration', 'merchant', 'details', 'transaction particulars', 'particulars', 'memo']);
  const amountColumn = findColumn(headers, ['amount', 'transaction amount', 'debit amount']);
  const debitColumn = findColumn(headers, ['debit', 'withdrawal', 'paid out']);
  const creditColumn = findColumn(headers, ['credit', 'deposit', 'paid in']);
  const typeColumn = findColumn(headers, ['transaction type', 'type', 'dr cr', 'debit credit']);
  if (dateColumn < 0 || descriptionColumn < 0 || (amountColumn < 0 && debitColumn < 0)) {
    throw new Error('Could not identify date, description, and amount columns. Try Date, Description, and Amount headers.');
  }
  const transactions = [];
  for (const cells of table.slice(1)) {
    const date = parseDate(cells[dateColumn]);
    const description = String(cells[descriptionColumn] || '').trim();
    let amount = amountColumn >= 0 ? parseMoney(cells[amountColumn]) : null;
    let isDebit = false;
    if (amountColumn < 0) {
      const debit = parseMoney(cells[debitColumn]);
      const credit = creditColumn >= 0 ? parseMoney(cells[creditColumn]) : null;
      amount = debit && debit !== 0 ? -Math.abs(debit) : credit && credit !== 0 ? Math.abs(credit) : null;
      isDebit = !!(debit && debit !== 0);
    }
    if (!date || !description || amount == null || amount === 0) continue;
    const type = typeColumn >= 0 ? String(cells[typeColumn] || '').toLowerCase() : '';
    isDebit ||= amount < 0 || (amountColumn >= 0 && headers[amountColumn].includes('debit')) || /\b(debit|withdrawal|purchase|dr)\b/.test(type) || (!type && amountColumn >= 0);
    transactions.push({ date, description, amount: Math.abs(amount), debit: isDebit });
  }
  if (transactions.length < 2) throw new Error('I could not find enough dated transactions to look for recurring charges.');
  return transactions;
}

function parsePdfText(text) {
  const transactions = [];
  const pattern = /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\s+(.+?)\s+(-?\(?\s*₹?\s*[\d,]+\.\d{2}\s*\)?)/;
  for (const line of text.split(/\n+/).map(value => value.replace(/\s+/g, ' ').trim())) {
    const match = line.match(pattern);
    if (!match) continue;
    const date = parseDate(match[1]);
    const amount = parseMoney(match[3]);
    if (date && match[2].trim() && amount) transactions.push({ date, description: match[2].trim(), amount: Math.abs(amount), debit: true });
  }
  if (transactions.length < 2) throw new Error('This PDF did not expose clear transaction rows. Scanned PDFs are unsupported; try a CSV export.');
  return transactions;
}

async function readPdf(file) {
  const [pdfjsLib, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ]);
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
  let document;
  try { document = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; }
  catch { throw new Error('This PDF may be scanned, password-protected, or unreadable. Try a text-based PDF or CSV export.'); }
  const lines = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const rows = new Map();
    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform?.[5] || 0);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: item.transform?.[4] || 0, text: item.str });
    }
    for (const [, items] of [...rows.entries()].sort((a,b) => b[0] - a[0])) {
      lines.push(items.sort((a,b) => a.x - b.x).map(item => item.text).join(' '));
    }
  }
  return parsePdfText(lines.join('\n'));
}

export async function parseStatement(file) {
  return file.name.toLowerCase().endsWith('.pdf') ? readPdf(file) : parseCsv(await file.text());
}

const categories = [
  [/netflix|prime video|hotstar|disney|zee5|sonyliv|hulu|max streaming/, 'Streaming', 'Clapperboard'],
  [/spotify|apple music|youtube music|wynk|gaana/, 'Music', 'Music2'],
  [/google|icloud|dropbox|microsoft|adobe|notion|canva|openai|anthropic|github/, 'Software & cloud', 'Cloud'],
  [/gym|fitness|cult fit/, 'Fitness', 'Dumbbell'],
  [/newspaper|times of india|economist|medium/, 'News & reading', 'Newspaper']
];

function classify(merchant) {
  const value = normalizeMerchant(merchant);
  const match = categories.find(([pattern]) => pattern.test(value));
  return match ? { category: match[1], icon: match[2] } : { category: 'Digital service', icon: 'CircleDot' };
}

export function detectRecurring(transactions, separatedTransactions = []) {
  const groups = new Map();
  const separated = new Set(separatedTransactions);
  for (const transaction of transactions.filter(item => item.debit && !separated.has(transactionId(item)))) {
    const key = normalizeMerchant(transaction.description);
    if (key.length < 3) continue;
    groups.set(key, [...(groups.get(key) || []), transaction]);
  }
  const findings = [];
  for (const [key, entries] of groups) {
    const sorted = entries.sort((a,b) => a.date - b.date);
    if (sorted.length < 2) continue;
    const gaps = sorted.slice(1).map((item, index) => Math.round((item.date - sorted[index].date) / 86_400_000));
    const intervals = [
      ['Monthly', 25, 35], ['Weekly', 5, 9], ['Every 2 weeks', 12, 17], ['Quarterly', 80, 100], ['Annual', 350, 380]
    ];
    const matched = intervals.find(([, min, max]) => gaps.filter(gap => gap >= min && gap <= max).length >= Math.min(2, gaps.length));
    const cadence = matched?.[0];
    if (!cadence) continue;
    const previousAmount = sorted.at(-2).amount;
    const latest = sorted.at(-1);
    const increasePercent = previousAmount > 0 && latest.amount > previousAmount * 1.03
      ? Math.round((latest.amount / previousAmount - 1) * 100) : 0;
    const { category, icon } = classify(latest.description);
    const matchedGaps = matched ? gaps.filter(gap => gap >= matched[1] && gap <= matched[2]) : [];
    const confidence = sorted.length >= 4 && matchedGaps.length >= 2 ? 'High' : sorted.length >= 3 && matchedGaps.length >= 2 ? 'Medium' : 'Low';
    const dates = sorted.map(item => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(item.date));
    findings.push({
      id: key, key, merchant: latest.description, category, icon, cadence,
      amount: latest.amount, previousAmount, increasePercent,
      occurrences: sorted.length, lastDate: latest.date, confidence, reviewStatus: sorted.length >= 3 && matchedGaps.length >= 2 ? 'suspected' : 'needs review',
      transactions: sorted.map(item => ({ date: item.date, amount: item.amount, description: item.description, evidenceId: transactionId(item) })),
      evidence: `${sorted.length} charges on ${dates.join(', ')} · intervals ${gaps.join(', ')} days · amounts ${sorted.map(item => item.amount).map(value => `₹${value}`).join(', ')}`
    });
  }
  return findings.sort((a,b) => b.amount - a.amount);
}

export function transactionId(transaction) {
  return `${transaction.date.toISOString()}|${transaction.amount}|${transaction.description}`;
}

export function sampleTransactions() {
  const date = (month, day = 5) => new Date(Date.UTC(2026, month - 1, day));
  const record = (month, day, description, amount) => ({ date: date(month, day), description, amount, debit: true });
  return [
    record(5,5,'NETFLIX.COM SUBSCRIPTION',649), record(6,5,'NETFLIX.COM SUBSCRIPTION',649), record(7,5,'NETFLIX.COM SUBSCRIPTION',649), record(8,5,'NETFLIX.COM SUBSCRIPTION',649), record(9,5,'NETFLIX.COM SUBSCRIPTION',649), record(10,5,'NETFLIX.COM SUBSCRIPTION',749),
    record(5,12,'SPOTIFY PREMIUM',119), record(6,12,'SPOTIFY PREMIUM',119), record(7,12,'SPOTIFY PREMIUM',119), record(8,12,'SPOTIFY PREMIUM',119), record(9,12,'SPOTIFY PREMIUM',119), record(10,12,'SPOTIFY PREMIUM',119),
    record(6,19,'GOOGLE ONE 100GB',130), record(7,19,'GOOGLE ONE 100GB',130), record(8,19,'GOOGLE ONE 100GB',130), record(9,19,'GOOGLE ONE 100GB',130), record(10,19,'GOOGLE ONE 100GB',130),
    record(7,24,'UBER TRIP 8834102',284), record(8,28,'UBER TRIP 9930141',312), record(9,3,'FRESHMART GROCERY',875), record(10,3,'FRESHMART GROCERY',904)
  ];
}
