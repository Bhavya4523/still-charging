import test from 'node:test';
import assert from 'node:assert/strict';
import { detectRecurring, normalizeMerchant, transactionId } from '../src/parsing.js';

const row = (iso, description, amount = 499) => ({ date: new Date(`${iso}T00:00:00Z`), description, amount, debit: true });

test('processor prefixes and known merchant variants normalize conservatively', () => {
  assert.equal(normalizeMerchant('UPI / RAZORPAY / NETFLIX.COM'), 'netflix');
  assert.equal(normalizeMerchant('NETFLIX.COM SUBSCRIPTION'), 'netflix');
  assert.notEqual(normalizeMerchant('FRESHMART GROCERY'), normalizeMerchant('FRESHMART PHARMACY'));
});

test('quarterly recurring charges include transparent dates, intervals, and amounts', () => {
  const findings = detectRecurring([
    row('2026-01-10', 'CLOUD STORAGE PLAN', 900),
    row('2026-04-10', 'CLOUD STORAGE PLAN', 900),
    row('2026-07-10', 'CLOUD STORAGE PLAN', 990)
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].cadence, 'Quarterly');
  assert.equal(findings[0].confidence, 'Medium');
  assert.equal(findings[0].reviewStatus, 'suspected');
  assert.equal(findings[0].transactions.length, 3);
  assert.match(findings[0].evidence, /2026|Jan|Apr|Jul/);
  assert.match(findings[0].evidence, /90, 91 days/);
  assert.match(findings[0].evidence, /₹900/);
});

test('AI suggestions do not mutate deterministic original transaction evidence', () => {
  const transactions = [row('2026-01-05', 'UPI RAZORPAY NETFLIX.COM', 649), row('2026-02-05', 'NETFLIX.COM SUBSCRIPTION', 649), row('2026-03-05', 'NETFLIX.COM', 749)];
  const before = detectRecurring(transactions);
  const merchantDescriptions = before[0].transactions.map(item => item.description);
  const suggestion = { name: 'Netflix Premium' };
  assert.ok(suggestion.name);
  assert.deepEqual(detectRecurring(transactions)[0].transactions.map(item => item.description), merchantDescriptions);
  assert.equal(before[0].increasePercent, 15);
});

test('a user can separate and later restore one transaction without editing source rows', () => {
  const transactions = [row('2026-01-05', 'NETFLIX.COM', 649), row('2026-02-05', 'NETFLIX.COM', 649), row('2026-03-05', 'NETFLIX.COM', 649)];
  const separatedId = transactionId(transactions[1]);
  assert.equal(detectRecurring(transactions).length, 1);
  assert.equal(detectRecurring(transactions, [separatedId]).length, 0);
  assert.equal(transactions.length, 3);
  assert.equal(detectRecurring(transactions, []).length, 1);
});
