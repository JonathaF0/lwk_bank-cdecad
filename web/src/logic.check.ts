// Run: node src/logic.check.ts   (Node 22.18+ strips the types itself)
import assert from 'node:assert/strict';
import { accentTokens, borrowLimit, creditBand, quoteLoan } from './logic.ts';

const bands = [
  { min: 300, label: 'Very Poor', adjust: 3 },
  { min: 500, label: 'Poor', adjust: 2 },
  { min: 670, label: 'Good', adjust: 0 },
  { min: 800, label: 'Excellent', adjust: -3 },
];

assert.equal(creditBand(300, bands).label, 'Very Poor');
assert.equal(creditBand(669, bands).label, 'Poor');
assert.equal(creditBand(670, bands).label, 'Good');
assert.equal(creditBand(850, bands).index, 3);
assert.equal(creditBand(100, bands).label, 'Very Poor', 'below range clamps to the lowest band');

const q = quoteLoan(10_000, 10, 24, -3);
assert.deepEqual(q, { rate: 7, interest: 700, total: 10_700, daily: 446 });
assert.equal(quoteLoan(1_000, 2, 12, -3).rate, 0, 'rate never goes negative');
assert.ok(q.daily * 24 >= q.total, 'instalments cover the total');

assert.equal(borrowLimit(20_000, { balanceMultiplier: 3 } as never), 60_000);
assert.equal(borrowLimit(-50, { balanceMultiplier: 3 } as never), 0);

assert.equal(accentTokens('nope'), null);
assert.equal(accentTokens('#c8f031')!['--accent-ink'], '#0b0d06', 'bright accent gets dark ink');
assert.equal(accentTokens('#1d3fd1')!['--accent-ink'], '#f4f6f2', 'dark accent gets light ink');
assert.equal(accentTokens('#fff')!['--accent'], 'rgb(255, 255, 255)');

console.log('logic ok');
