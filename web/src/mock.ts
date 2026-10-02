import { DEFAULT_CONFIG, type Account, type BankConfig, type BankData, type CardTier, type Perms, type Result, type Transaction, type TxType } from './nui';
import { borrowLimit, creditBand, quoteLoan } from './logic';

/* Browser-only stand-in for the Lua side. fetchNui only calls this when
 * GetParentResourceName is missing, i.e. never inside FiveM. */

const DAY = 86_400_000;
const now = Date.now();
const ago = (days: number, hours = 0) => now - days * DAY - hours * 3_600_000;
const ALL: Perms = { deposit: true, withdraw: true, transfer: true, loans: true };

let seq = 100;
const id = (p: string) => `${p}${seq++}`;
const tx = (accountId: string, type: TxType, amount: number, label: string, date: number, counterparty?: string, pot?: 'savings'): Transaction => ({
  id: id('tx'),
  accountId,
  type,
  amount,
  label,
  date,
  counterparty,
  pot,
});

const weekly = (amounts: number[]) => amounts.map((amount, i) => ({ date: ago(7 * (amounts.length - i)), amount }));

const state: BankData = {
  config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
  player: { name: 'Marcus Vale', cash: 1_250 },
  creditScore: 712,
  accounts: [
    {
      id: 'acc1', type: 'personal', name: 'Everyday', iban: 'LW204118', balance: 48_210, savings: 12_400,
      goals: [
        { id: 'g1', name: 'Pegassi Zentorno', target: 95_000, saved: 31_500 },
        { id: 'g2', name: 'Rainy day fund', target: 10_000, saved: 7_200 },
      ],
      history: [39_400, 41_150, 40_020, 43_880, 44_960, 46_300, 48_210],
      interestHistory: weekly([182, 205, 231, 248, 256]),
      nextInterestAt: now + 2 * DAY + 5 * 3_600_000,
      openedAt: ago(331), role: 'owner', perms: ALL, members: [],
    },
    {
      id: 'acc2', type: 'business', name: 'Bean Machine Co.', iban: 'LW771402', balance: 212_640, savings: 40_000, goals: [],
      history: [188_000, 191_420, 197_300, 195_880, 203_150, 209_900, 212_640],
      interestHistory: weekly([360, 380, 392, 400]),
      nextInterestAt: now + 2 * DAY + 5 * 3_600_000,
      openedAt: ago(204), role: 'owner', perms: ALL,
      members: [
        { id: 'p1', name: 'Marcus Vale', role: 'owner', perms: ALL },
        { id: 'p2', name: 'Tasha Reyes', role: 'member', perms: { deposit: true, withdraw: false, transfer: true, loans: false } },
        { id: 'p3', name: 'Kenji Mori', role: 'member', perms: { deposit: true, withdraw: false, transfer: false, loans: false } },
      ],
    },
    {
      id: 'acc3', type: 'shared', name: 'Apartment 4B', iban: 'LW559023', balance: 3_480, savings: 0, goals: [],
      history: [5_100, 5_100, 4_620, 4_620, 3_900, 3_480, 3_480],
      interestHistory: [], openedAt: ago(96), role: 'member',
      perms: { deposit: true, withdraw: true, transfer: false, loans: false },
      members: [
        { id: 'p4', name: 'Lena Park', role: 'owner', perms: ALL },
        { id: 'p1', name: 'Marcus Vale', role: 'member', perms: { deposit: true, withdraw: true, transfer: false, loans: false } },
      ],
    },
  ],
  transactions: [
    tx('acc1', 'transfer_in', 2_500, 'Transfer received', ago(0, 1), 'Lena Park'),
    tx('acc1', 'bill', 640, 'Los Santos Customs', ago(0, 5)),
    tx('acc1', 'paycheck', 1_850, 'Paycheck · LSPD', ago(1, 2)),
    tx('acc1', 'withdraw', 300, 'ATM withdrawal · Legion Sq.', ago(1, 9)),
    tx('acc1', 'transfer_out', 1_200, 'Rent share', ago(2, 3), 'Apartment 4B'),
    tx('acc1', 'interest', 256, 'Weekly interest', ago(3, 0), undefined, 'savings'),
    tx('acc1', 'transfer_out', 2_000, 'Moved to savings', ago(3, 1), undefined, 'savings'),
    tx('acc1', 'deposit', 4_000, 'Cash deposit', ago(3, 6)),
    tx('acc1', 'bill', 1_120, 'Pillbox Medical', ago(4, 2)),
    tx('acc1', 'paycheck', 1_850, 'Paycheck · LSPD', ago(8, 2)),
    tx('acc1', 'transfer_out', 7_500, 'Sanchez parts', ago(9, 4), 'Dre Coleman'),
    tx('acc2', 'transfer_in', 12_400, 'Catering invoice', ago(0, 3), 'Maze Events'),
    tx('acc2', 'bill', 3_900, 'Coffee bean supplier', ago(2, 1)),
    tx('acc2', 'deposit', 6_250, 'Till deposit', ago(4, 8)),
    tx('acc3', 'bill', 420, 'Electricity', ago(1, 1)),
    tx('acc3', 'transfer_in', 1_200, 'Rent share', ago(2, 3), 'Marcus Vale'),
  ],
  contacts: [
    { id: 'c1', name: 'Lena Park', iban: 'LW318806' },
    { id: 'c2', name: 'Dre Coleman', iban: 'LW902245' },
    { id: 'c3', name: 'Yusuf Adebayo', iban: 'LW117730' },
    { id: 'c4', name: 'Maze Events', iban: 'LW640091' },
  ],
  cards: [
    { id: 'card1', accountId: 'acc1', tier: 'premium', last4: '4821', holder: 'Marcus Vale', expiresAt: now + 64 * DAY, status: 'active', dailyLimit: 25_000, spentToday: 3_200, autoRenew: true },
    { id: 'card2', accountId: 'acc2', tier: 'gold', last4: '0915', holder: 'Marcus Vale', expiresAt: now + 41 * DAY, status: 'active', dailyLimit: 100_000, spentToday: 18_500, autoRenew: false },
    { id: 'card3', accountId: 'acc1', tier: 'standard', last4: '7730', holder: 'Marcus Vale', expiresAt: now + 5 * DAY, status: 'blocked', dailyLimit: 5_000, spentToday: 0, autoRenew: false },
    { id: 'card4', accountId: 'acc3', tier: 'standard', last4: '2260', holder: 'Marcus Vale', expiresAt: now + 90 * DAY, status: 'inactive', dailyLimit: 5_000, spentToday: 0, autoRenew: false },
  ],
  loans: [
    { id: 'l1', accountId: 'acc1', planId: 'standard', principal: 20_000, remaining: 14_170, rate: 9, termDays: 24, dailyPayment: 909, nextDueAt: now + 5 * 3_600_000, status: 'active', createdAt: ago(9) },
    { id: 'l2', accountId: 'acc1', planId: 'starter', principal: 5_000, remaining: 1_860, rate: 11, termDays: 12, dailyPayment: 463, nextDueAt: now - 2 * 3_600_000, status: 'grace', createdAt: ago(10) },
  ],
  bills: [
    { id: 'b1', label: 'Engine repair', issuer: 'Los Santos Customs', amount: 1_450, issuedAt: ago(0, 6), status: 'unpaid' },
    { id: 'b2', label: 'Emergency treatment', issuer: 'Pillbox Medical', amount: 820, issuedAt: ago(1, 3), status: 'unpaid' },
    { id: 'b3', label: 'Speeding · Del Perro Fwy', issuer: 'LSPD', amount: 350, issuedAt: ago(2, 7), status: 'unpaid' },
    { id: 'b4', label: 'Classified ad', issuer: 'Weazel News', amount: 600, issuedAt: ago(6), status: 'paid', paidAt: ago(5) },
    { id: 'b5', label: 'Electricity', issuer: 'LS Water & Power', amount: 420, issuedAt: ago(9), status: 'paid', paidAt: ago(8) },
  ],
};

/** Dev-only test PIN for every mock card. */
const pins: Record<string, string> = { card1: '1234', card2: '1234', card3: '1234', card4: '1234' };

export const getMockData = (): BankData => JSON.parse(JSON.stringify(state));

/** DevBar: try a server owner's config without editing code. */
export function patchMockConfig(fn: (c: BankConfig) => void): BankData {
  fn(state.config);
  return getMockData();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (): Result => ({ ok: true, data: getMockData() });
const fail = (error: string): Result => ({ ok: false, error });
const acc = (accountId: string) => state.accounts.find((a) => a.id === accountId);
const randDigits = (n: number) => Array.from({ length: n }, () => (Math.random() * 10) | 0).join('');

function move(a: Account, delta: number, type: TxType, label: string, counterparty?: string, pot?: 'savings') {
  a.balance += delta;
  if (a.history) a.history[a.history.length - 1] = a.balance;
  state.transactions.unshift(tx(a.id, type, Math.abs(delta), label, Date.now(), counterparty, pot));
}

export function simulateIncoming(): BankData {
  move(state.accounts[0], 750, 'transfer_in', 'Transfer received', 'Yusuf Adebayo');
  return getMockData();
}

export async function mockHandler(event: string, p: any): Promise<unknown> {
  await wait(event === 'close' ? 0 : 450);
  const a = p?.accountId ? acc(p.accountId) : undefined;
  const amount = Number(p?.amount);
  const cfg = state.config;
  const card = p?.cardId ? state.cards.find((c) => c.id === p.cardId) : undefined;
  const goal = p?.goalId ? state.accounts.flatMap((x) => x.goals.map((g) => ({ g, owner: x }))).find((x) => x.g.id === p.goalId) : undefined;

  switch (event) {
    case 'close':
      return {};
    case 'verifyPin':
      return pins[p.cardId] === p.pin ? { ok: true } : { ok: false, error: 'Incorrect PIN · 2 attempts left' };

    /* ---------- cash ---------- */
    case 'deposit':
      if (!a || !(amount > 0)) return fail('Enter an amount above zero');
      if (!a.perms.deposit) return fail("You don't have deposit access on this account");
      if (amount > state.player.cash) return fail("You don't have that much cash on you");
      state.player.cash -= amount;
      move(a, amount, 'deposit', p.atm ? 'ATM deposit' : 'Cash deposit');
      return ok();
    case 'withdraw':
      if (!a || !(amount > 0)) return fail('Enter an amount above zero');
      if (!a.perms.withdraw) return fail("You don't have withdraw access on this account");
      if (amount > a.balance) return fail('Insufficient funds');
      state.player.cash += amount;
      move(a, -amount, 'withdraw', p.atm ? 'ATM withdrawal' : 'Cash withdrawal');
      return ok();

    /* ---------- transfers + contacts ---------- */
    case 'transfer': {
      const ibans: string[] = (p.ibans ?? []).map((i: string) => String(i).toUpperCase());
      if (!a || !(amount > 0) || !ibans.length) return fail('Enter an amount above zero');
      if (!a.perms.transfer) return fail("You don't have transfer access on this account");
      if (amount * ibans.length > a.balance) return fail('Insufficient funds');
      if (ibans.includes(a.iban)) return fail("You can't send money to the same account");
      for (const iban of ibans) {
        const own = state.accounts.find((x) => x.iban === iban);
        const contact = state.contacts.find((c) => c.iban === iban);
        if (!own && !contact && !/^[A-Z]{2}\d{6}$/.test(iban)) return fail(`No account found for ${iban}`);
      }
      for (const iban of ibans) {
        const own = state.accounts.find((x) => x.iban === iban);
        const to = own?.name ?? state.contacts.find((c) => c.iban === iban)?.name ?? iban;
        move(a, -amount, 'transfer_out', p.note || 'Transfer sent', to);
        if (own) move(own, amount, 'transfer_in', p.note || 'Transfer received', a.name);
      }
      return ok();
    }
    case 'contactSave':
      if (!String(p.name ?? '').trim()) return fail('Give the contact a name');
      if (state.contacts.some((c) => c.iban === p.iban)) return fail('That IBAN is already saved');
      state.contacts.push({ id: id('c'), name: String(p.name).trim(), iban: p.iban });
      return ok();
    case 'contactDelete':
      state.contacts = state.contacts.filter((c) => c.id !== p.contactId);
      return ok();

    /* ---------- cards ---------- */
    case 'cardOrder': {
      if (!a) return fail('Pick an account');
      if (state.cards.length >= cfg.cards.maxCards) return fail(`You can hold ${cfg.cards.maxCards} cards at most`);
      const tier = cfg.cards.tiers[p.tier as CardTier];
      if (!tier) return fail('Unknown card type');
      if (tier.fee > a.balance) return fail(`The card costs ${tier.fee} and ${a.name} can't cover it`);
      move(a, -tier.fee, 'fee', `${p.tier[0].toUpperCase()}${p.tier.slice(1)} card issued`);
      state.cards.push({ id: id('card'), accountId: a.id, tier: p.tier, last4: randDigits(4), holder: state.player.name, expiresAt: Date.now() + cfg.cards.validDays * DAY, status: 'inactive', dailyLimit: tier.dailyLimit, spentToday: 0, autoRenew: false });
      pins[state.cards[state.cards.length - 1].id] = '1234';
      return ok();
    }
    case 'cardActivate': {
      if (!card) return fail('Card not found');
      if (state.cards.filter((c) => c.status === 'active').length >= cfg.cards.maxActive) return fail(`Only ${cfg.cards.maxActive} cards can be active at once`);
      const owner = acc(card.accountId)!;
      if (cfg.cards.activationFee > owner.balance) return fail('Not enough funds for the activation fee');
      move(owner, -cfg.cards.activationFee, 'fee', `Card ··${card.last4} activated`);
      card.status = 'active';
      return ok();
    }
    case 'cardBlock':
      if (!card) return fail('Card not found');
      card.status = p.blocked ? 'blocked' : 'active';
      return ok();
    case 'cardRenew': {
      if (!card) return fail('Card not found');
      const owner = acc(card.accountId)!;
      if (cfg.cards.renewalFee > owner.balance) return fail('Not enough funds for the renewal fee');
      move(owner, -cfg.cards.renewalFee, 'fee', `Card ··${card.last4} renewed`);
      card.expiresAt = Math.max(card.expiresAt, Date.now()) + cfg.cards.validDays * DAY;
      return ok();
    }
    case 'cardAutoRenew':
      if (!card) return fail('Card not found');
      card.autoRenew = !!p.enabled;
      return ok();
    case 'cardPin':
      if (!card || !/^\d{4}$/.test(p.pin)) return fail('PIN must be 4 digits');
      pins[card.id] = p.pin;
      return ok();
    case 'cardLimit': {
      if (!card) return fail('Card not found');
      const max = cfg.cards.tiers[card.tier].dailyLimit;
      const limit = Number(p.limit);
      if (!(limit >= 0)) return fail('Invalid limit');
      if (limit > max) return fail(`A ${card.tier} card allows up to ${max} a day`);
      card.dailyLimit = limit;
      return ok();
    }
    case 'cardDelete':
      state.cards = state.cards.filter((c) => c.id !== p.cardId);
      return ok();

    /* ---------- savings ---------- */
    case 'savingsMove':
      if (!a || !(amount > 0)) return fail('Enter an amount above zero');
      if (p.direction === 'in') {
        if (amount > a.balance) return fail('Not enough in checking');
        a.balance -= amount;
        a.savings += amount;
        state.transactions.unshift(tx(a.id, 'transfer_out', amount, 'Moved to savings', Date.now(), undefined, 'savings'));
      } else {
        if (amount > a.savings) return fail('Not enough in savings');
        a.savings -= amount;
        a.balance += amount;
        state.transactions.unshift(tx(a.id, 'transfer_in', amount, 'Moved from savings', Date.now(), undefined, 'savings'));
      }
      return ok();
    case 'goalCreate':
      if (!a) return fail('Pick an account');
      if (!String(p.name ?? '').trim()) return fail('Name your goal');
      if (!(Number(p.target) > 0)) return fail('Set a target above zero');
      a.goals.push({ id: id('g'), name: String(p.name).trim(), target: Number(p.target), saved: 0 });
      return ok();
    case 'goalMove':
      if (!goal || !(amount > 0)) return fail('Enter an amount above zero');
      if (p.direction === 'in') {
        if (amount > goal.owner.balance) return fail('Not enough in checking');
        goal.owner.balance -= amount;
        goal.g.saved += amount;
        state.transactions.unshift(tx(goal.owner.id, 'transfer_out', amount, `Saved to ${goal.g.name}`, Date.now(), undefined, 'savings'));
      } else {
        if (amount > goal.g.saved) return fail('The goal holds less than that');
        goal.g.saved -= amount;
        goal.owner.balance += amount;
        state.transactions.unshift(tx(goal.owner.id, 'transfer_in', amount, `Taken from ${goal.g.name}`, Date.now(), undefined, 'savings'));
      }
      return ok();
    case 'goalDelete':
      if (!goal) return fail('Goal not found');
      goal.owner.balance += goal.g.saved;
      goal.owner.goals = goal.owner.goals.filter((g) => g.id !== goal.g.id);
      return ok();

    /* ---------- loans ---------- */
    case 'loanApply': {
      if (!a) return fail('Pick an account');
      if (!a.perms.loans) return fail("You don't have loan access on this account");
      if (state.loans.length >= cfg.loans.maxActive) return fail(`You can have ${cfg.loans.maxActive} active loans at most`);
      const plan = cfg.loans.plans.find((x) => x.id === p.planId);
      if (!plan) return fail('Unknown loan plan');
      if (amount < plan.min || amount > plan.max) return fail(`${plan.name} loans run from ${plan.min} to ${plan.max}`);
      if (!cfg.loans.terms.includes(Number(p.termDays))) return fail('Pick a repayment term');
      const total = state.accounts.reduce((s, x) => s + x.balance + x.savings, 0);
      const owed = state.loans.reduce((s, l) => s + l.remaining, 0);
      if (amount + owed > borrowLimit(total, cfg.loans)) return fail('That would put you over your borrowing limit');
      const q = quoteLoan(amount, plan.rate, p.termDays, creditBand(state.creditScore, cfg.loans.bands).adjust);
      state.loans.push({ id: id('l'), accountId: a.id, planId: plan.id, principal: amount, remaining: q.total, rate: q.rate, termDays: p.termDays, dailyPayment: q.daily, nextDueAt: Date.now() + DAY, status: 'active', createdAt: Date.now() });
      move(a, amount, 'loan', `${plan.name} loan`, cfg.bankName);
      return ok();
    }
    case 'loanPay': {
      const loan = state.loans.find((l) => l.id === p.loanId);
      if (!loan || !(amount > 0)) return fail('Enter an amount above zero');
      const owner = acc(loan.accountId)!;
      if (amount > owner.balance) return fail(`Not enough in ${owner.name}`);
      const pay = Math.min(amount, loan.remaining);
      move(owner, -pay, 'transfer_out', 'Loan repayment', cfg.bankName);
      loan.remaining -= pay;
      loan.status = 'active';
      if (loan.remaining <= 0) {
        state.loans = state.loans.filter((l) => l !== loan);
        state.creditScore = Math.min(850, state.creditScore + 12);
      }
      return ok();
    }

    /* ---------- bills ---------- */
    case 'billPay':
    case 'billPayAll': {
      if (!a) return fail('Pick an account');
      const due = state.bills.filter((b) => b.status === 'unpaid' && (event === 'billPayAll' || b.id === p.billId));
      const sum = due.reduce((s, b) => s + b.amount, 0);
      if (!due.length) return fail('Nothing to pay');
      if (sum > a.balance) return fail(`Not enough in ${a.name}`);
      for (const b of due) {
        move(a, -b.amount, 'bill', b.issuer);
        b.status = 'paid';
        b.paidAt = Date.now();
      }
      return ok();
    }
    case 'receiptPrint':
      return ok();

    /* ---------- accounts ---------- */
    case 'accountCreate': {
      const owned = state.accounts.filter((x) => x.role === 'owner').length;
      if (owned >= cfg.accounts.maxOwned) return fail(`You can own ${cfg.accounts.maxOwned} accounts at most`);
      if (!String(p.name ?? '').trim()) return fail('Name the account');
      if (cfg.accounts.creationFee > state.player.cash) return fail(`Opening an account costs ${cfg.accounts.creationFee} cash`);
      state.player.cash -= cfg.accounts.creationFee;
      state.accounts.push({
        id: id('acc'), type: p.type, name: String(p.name).trim(), iban: cfg.accounts.ibanPrefix + randDigits(6), balance: 0, savings: 0, goals: [],
        history: [0, 0, 0, 0, 0, 0, 0], interestHistory: [], openedAt: Date.now(), role: 'owner', perms: ALL,
        members: p.type === 'shared' ? [{ id: 'p1', name: state.player.name, role: 'owner', perms: ALL }] : [],
      });
      return ok();
    }
    case 'accountRename':
      if (!a || !String(p.name ?? '').trim()) return fail('Name the account');
      if (a.role !== 'owner') return fail('Only the owner can rename this account');
      a.name = String(p.name).trim();
      return ok();
    case 'accountDelete':
      if (!a) return fail('Account not found');
      if (a.role !== 'owner') return fail('Only the owner can close this account');
      if (a.type === 'business') return fail('Business accounts are managed by the society');
      if (a.balance + a.savings + a.goals.reduce((s, g) => s + g.saved, 0) > 0) return fail('Empty the account before closing it');
      if (state.accounts.filter((x) => x.type === 'personal').length <= 1 && a.type === 'personal') return fail("You can't close your last personal account");
      state.accounts = state.accounts.filter((x) => x !== a);
      return ok();
    case 'accountIban': {
      if (!a) return fail('Account not found');
      const iban = String(p.iban ?? '').toUpperCase();
      if (!/^[A-Z0-9]{4,12}$/.test(iban)) return fail('4–12 letters or numbers');
      if (state.accounts.some((x) => x.iban === iban)) return fail('That IBAN is taken');
      if (cfg.accounts.ibanFee > a.balance) return fail(`A custom IBAN costs ${cfg.accounts.ibanFee}`);
      move(a, -cfg.accounts.ibanFee, 'fee', 'Custom IBAN');
      a.iban = iban;
      return ok();
    }
    case 'memberAdd':
      if (!a) return fail('Account not found');
      if (!/^\d+$/.test(String(p.playerId))) return fail('Enter the player\'s server ID');
      if (a.members.some((m) => m.id === `s${p.playerId}`)) return fail('Already a member');
      a.members.push({ id: `s${p.playerId}`, name: `Player ${p.playerId}`, role: 'member', perms: { deposit: true, withdraw: false, transfer: false, loans: false } });
      return ok();
    case 'memberRemove':
      if (!a) return fail('Account not found');
      a.members = a.members.filter((m) => m.id !== p.memberId || m.role === 'owner');
      return ok();
    case 'memberPerms': {
      const m = a?.members.find((x) => x.id === p.memberId);
      if (!m || m.role === 'owner') return fail("The owner's access can't be changed");
      m.perms = { ...m.perms, ...p.perms };
      return ok();
    }
    default:
      return fail(`Unknown event ${event}`);
  }
}
