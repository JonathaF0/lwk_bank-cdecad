import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import type { Loan } from '../nui';
import { useBank } from '../store';
import { CountUp, HoldButton } from '../fx';
import { borrowLimit, creditBand, quoteLoan, timeUntil } from '../logic';
import { AmountField, Dialog, ErrorLine, Progress, SubmitButton, useAction } from '../ui';
import { AccountPills } from './Overview';
import type { SectionProps } from './Bank';

const STATUS = { active: 'On track', grace: 'Grace period', late: 'Late' } as const;

export function Loans({ accountId, setAccountId, active }: SectionProps) {
  const { data, cfg, money } = useBank();
  const { busy, error, run } = useAction();
  const lc = cfg.loans;
  const band = creditBand(data.creditScore, lc.bands);
  const totalBalance = data.accounts.reduce((s, a) => s + a.balance + a.savings, 0);
  const owed = data.loans.reduce((s, l) => s + l.remaining, 0);
  const available = Math.max(0, borrowLimit(totalBalance, lc) - owed);

  const [planId, setPlanId] = useState(lc.plans[0]?.id);
  const plan = lc.plans.find((p) => p.id === planId) ?? lc.plans[0];
  const ceiling = plan ? Math.min(plan.max, available) : 0;
  const [amount, setAmount] = useState(plan?.min ?? 0);
  const [term, setTerm] = useState(lc.terms[1] ?? lc.terms[0]);
  const [paying, setPaying] = useState<Loan | null>(null);

  // Keep the amount inside the chosen plan's range.
  useEffect(() => {
    if (plan) setAmount((a) => Math.min(Math.max(a, plan.min), Math.max(plan.min, ceiling)));
  }, [plan, ceiling]);

  const acc = data.accounts.find((a) => a.id === accountId) ?? data.accounts[0];
  const q = plan ? quoteLoan(amount, plan.rate, term, band.adjust) : null;
  const atMax = data.loans.length >= lc.maxActive;
  const blocker = !acc?.perms.loans
    ? "You can't take loans on this account"
    : atMax
      ? `You already have ${lc.maxActive} active loans`
      : plan && ceiling < plan.min
        ? `Your limit doesn't cover the ${plan.name} minimum`
        : '';

  return (
    <div className="panel loans">
      <div className="ln-main">
        <CreditGauge score={data.creditScore} play={active} />
        <div className="ln-score-meta" data-reveal>
          <span className="pill-stat">{band.label}</span>
          <span className="pill-stat">
            Rate {band.adjust > 0 ? '+' : band.adjust < 0 ? '−' : '±'}
            {Math.abs(band.adjust)}%
          </span>
          <span className="pill-stat">Can borrow {money(available)}</span>
        </div>

        <div className="section-head" data-reveal>
          <span className="mono muted">
            Active loans · {data.loans.length}/{lc.maxActive}
          </span>
          <span className="mono muted">{money(owed)} owed</span>
        </div>
        {data.loans.length ? (
          <ul className="loan-list">
            {data.loans.map((l) => {
              const total = l.principal + Math.round((l.principal * l.rate) / 100);
              const p = lc.plans.find((x) => x.id === l.planId);
              return (
                <li key={l.id} className="loan" data-reveal>
                  <div className="loan-top">
                    <strong>{p?.name ?? 'Loan'}</strong>
                    <span className={`badge is-${l.status}`}>{STATUS[l.status]}</span>
                  </div>
                  <Progress value={total - l.remaining} max={total} label="Repaid" tone={l.status === 'late' ? 'neg' : l.status === 'grace' ? 'warn' : undefined} />
                  <div className="loan-bottom">
                    <span className="num">
                      {money(l.remaining)} <span className="muted">left · {money(l.dailyPayment)}/day</span>
                    </span>
                    <span className="mono muted">
                      {l.status === 'grace' ? `Pay within ${lc.graceHours}h` : `Due in ${timeUntil(l.nextDueAt)}`}
                    </span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setPaying(l)}>
                      Pay
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty-note" data-reveal>
            No active loans. Paying loans off on time raises your score.
          </p>
        )}
      </div>

      <aside className="ln-apply">
        <span className="mono muted" data-reveal>
          Loan calculator
        </span>
        <div className="plan-grid" role="radiogroup" aria-label="Loan plan" data-reveal>
          {lc.plans.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={p.id === plan?.id} className="plan-opt" onClick={() => setPlanId(p.id)}>
              <strong>{p.name}</strong>
              <span className="mono muted">
                {money(p.min)}–{money(p.max)}
              </span>
              <span className="mono">{p.rate}%</span>
            </button>
          ))}
        </div>

        {plan && (
          <>
            <div className="kv" data-reveal>
              <label className="kv-row" htmlFor="loan-amount">
                <span className="mono muted">Amount</span>
                <span className="num ln-amount">{money(amount)}</span>
              </label>
              <input
                id="loan-amount"
                type="range"
                className="range"
                min={plan.min}
                max={Math.max(plan.min, ceiling)}
                step={Math.max(100, Math.round((plan.max - plan.min) / 200 / 100) * 100)}
                value={amount}
                disabled={ceiling < plan.min}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </div>

            <div className="chips" role="radiogroup" aria-label="Repayment term" data-reveal>
              {lc.terms.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={t === term} className="chip" aria-pressed={t === term} onClick={() => setTerm(t)}>
                  {t} days
                </button>
              ))}
            </div>

            {q && (
              <dl className="quote" data-reveal>
                <div>
                  <dt className="mono muted">Rate</dt>
                  <dd>{q.rate}%</dd>
                </div>
                <div>
                  <dt className="mono muted">Interest</dt>
                  <dd className="num">{money(q.interest)}</dd>
                </div>
                <div>
                  <dt className="mono muted">Daily</dt>
                  <dd className="num">{money(q.daily)}</dd>
                </div>
                <div>
                  <dt className="mono muted">Total repay</dt>
                  <dd className="num">{money(q.total)}</dd>
                </div>
              </dl>
            )}

            <div className="ln-to" data-reveal>
              <span className="mono muted">Pay out to</span>
              <AccountPills accountId={acc?.id ?? ''} setAccountId={setAccountId} />
            </div>

            <div className="ln-go" data-reveal>
              <ErrorLine error={blocker || error} />
              <HoldButton
                label={busy ? 'Processing…' : `Borrow ${money(amount)}`}
                disabled={!!blocker || busy || !acc}
                onConfirm={() => run('loanApply', { accountId: acc!.id, planId: plan.id, amount, termDays: term }, 'counter')}
              />
            </div>
          </>
        )}
      </aside>

      {paying && <PayDialog loan={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

/* ---------- credit score gauge ---------- */

const MIN = 300;
const MAX = 850;
const angle = (s: number) => Math.PI * (1 - (Math.min(Math.max(s, MIN), MAX) - MIN) / (MAX - MIN));
const pt = (s: number, r: number) => [100 + r * Math.cos(angle(s)), 100 - r * Math.sin(angle(s))];

function CreditGauge({ score, play }: { score: number; play: boolean }) {
  const { cfg } = useBank();
  const root = useRef<HTMLDivElement>(null);
  const bands = cfg.loans.bands;
  const band = creditBand(score, bands);
  const arcs = useMemo(
    () =>
      bands.map((b, i) => {
        const from = Math.max(b.min, MIN) + (i ? 4 : 0);
        const to = (bands[i + 1]?.min ?? MAX) - 4;
        const [x1, y1] = pt(from, 80);
        const [x2, y2] = pt(to, 80);
        return `M${x1} ${y1} A80 80 0 0 1 ${x2} ${y2}`;
      }),
    [bands],
  );
  const deg = 180 - (angle(score) * 180) / Math.PI; // 0 = far left

  useGSAP(
    () => {
      if (!play) return;
      gsap.fromTo('.gauge-needle', { rotation: 0, svgOrigin: '100 100' }, { rotation: deg, svgOrigin: '100 100', duration: 1.8, ease: 'elastic.out(1, 0.6)', delay: 0.5 });
      gsap.fromTo('.gauge-arc', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6, stagger: 0.08, ease: 'power2.out', delay: 0.3 });
    },
    { scope: root, dependencies: [play, deg] },
  );

  return (
    <div ref={root} className="gauge" data-reveal>
      <svg viewBox="0 0 200 112" role="img" aria-label={`Credit score ${score}, ${band.label}`}>
        {arcs.map((d, i) => (
          <path key={i} d={d} className={`gauge-arc band-${Math.round((i / Math.max(bands.length - 1, 1)) * 5)}`} pathLength={1} strokeDasharray="1" opacity={i === band.index ? 1 : 0.35} />
        ))}
        <g className="gauge-needle">
          <line x1="100" y1="100" x2="30" y2="100" />
          <circle cx="100" cy="100" r="5" />
        </g>
      </svg>
      <div className="gauge-read">
        <CountUp value={score} format={(n) => String(n)} className="gauge-score" />
        <span className="mono muted">Credit score · {MIN}–{MAX}</span>
      </div>
    </div>
  );
}

function PayDialog({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const { data, money } = useBank();
  const { busy, error, run } = useAction();
  const [amount, setAmount] = useState(Math.min(loan.dailyPayment, loan.remaining));
  const acc = data.accounts.find((a) => a.id === loan.accountId);
  const over = !!acc && amount > acc.balance;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run('loanPay', { loanId: loan.id, amount: Math.min(amount, loan.remaining) }, 'chime');
    if (r.ok) onClose();
  };

  return (
    <Dialog title="Repay loan" onClose={onClose}>
      <form className="dialog-form" onSubmit={submit}>
        <AmountField amount={amount} setAmount={setAmount} invalid={over} />
        <div className="chips">
          <button type="button" className="chip" aria-pressed={amount === loan.dailyPayment} onClick={() => setAmount(Math.min(loan.dailyPayment, loan.remaining))}>
            Next payment · {money(Math.min(loan.dailyPayment, loan.remaining))}
          </button>
          <button type="button" className="chip" aria-pressed={amount === loan.remaining} onClick={() => setAmount(loan.remaining)}>
            Pay off · {money(loan.remaining)}
          </button>
        </div>
        <span className="mono muted">
          From {acc?.name} · {money(acc?.balance ?? 0)} available. Extra payments reduce what you owe.
        </span>
        <ErrorLine error={over ? 'Not enough in the account' : error} />
        <SubmitButton busy={busy} disabled={!amount || over} icon="check">
          Pay {money(Math.min(amount, loan.remaining))}
        </SubmitButton>
      </form>
    </Dialog>
  );
}
