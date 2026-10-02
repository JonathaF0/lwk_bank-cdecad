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

export function Loans({ accountId, setAccountId, active }: SectionProps) {
  const { data, cfg, money, t } = useBank();
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
    ? t('err_no_loan_access')
    : atMax
      ? t('err_max_loans', { count: lc.maxActive })
      : plan && ceiling < plan.min
        ? t('err_limit_below_min', { name: plan.name })
        : '';

  return (
    <div className="panel loans">
      <div className="ln-main">
        <CreditGauge score={data.creditScore} play={active} />
        <div className="ln-score-meta" data-reveal>
          <span className="pill-stat">{band.label}</span>
          <span className="pill-stat">
            {t('rate')} {band.adjust > 0 ? '+' : band.adjust < 0 ? '−' : '±'}
            {Math.abs(band.adjust)}%
          </span>
          <span className="pill-stat">{t('can_borrow', { amount: money(available) })}</span>
        </div>

        <div className="section-head" data-reveal>
          <span className="mono muted">
            {t('active_loans', { n: data.loans.length, max: lc.maxActive })}
          </span>
          <span className="mono muted">{t('owed', { amount: money(owed) })}</span>
        </div>
        {data.loans.length ? (
          <ul className="loan-list">
            {data.loans.map((l) => {
              const total = l.principal + Math.round((l.principal * l.rate) / 100);
              const p = lc.plans.find((x) => x.id === l.planId);
              return (
                <li key={l.id} className="loan" data-reveal>
                  <div className="loan-top">
                    <strong>{p?.name ?? t('loan')}</strong>
                    <span className={`badge is-${l.status}`}>{t('loan_' + l.status)}</span>
                  </div>
                  <Progress value={total - l.remaining} max={total} label={t('repaid')} tone={l.status === 'late' ? 'neg' : l.status === 'grace' ? 'warn' : undefined} />
                  <div className="loan-bottom">
                    <span className="num">
                      {money(l.remaining)} <span className="muted">{t('left_per_day', { amount: money(l.dailyPayment) })}</span>
                    </span>
                    <span className="mono muted">
                      {l.status === 'grace' ? t('pay_within', { hours: lc.graceHours }) : t('due_in', { time: timeUntil(l.nextDueAt) })}
                    </span>
                    <button className="btn btn-ghost btn-sm" onClick={() => setPaying(l)}>
                      {t('pay')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty-note" data-reveal>
            {t('no_loans')}
          </p>
        )}
      </div>

      <aside className="ln-apply">
        <span className="mono muted" data-reveal>
          {t('loan_calculator')}
        </span>
        <div className="plan-grid" role="radiogroup" aria-label={t('loan_plan')} data-reveal>
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
                <span className="mono muted">{t('amount')}</span>
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

            <div className="chips" role="radiogroup" aria-label={t('repayment_term')} data-reveal>
              {lc.terms.map((d) => (
                <button key={d} type="button" role="radio" aria-checked={d === term} className="chip" aria-pressed={d === term} onClick={() => setTerm(d)}>
                  {t('n_days', { count: d })}
                </button>
              ))}
            </div>

            {q && (
              <dl className="quote" data-reveal>
                <div>
                  <dt className="mono muted">{t('rate')}</dt>
                  <dd>{q.rate}%</dd>
                </div>
                <div>
                  <dt className="mono muted">{t('interest')}</dt>
                  <dd className="num">{money(q.interest)}</dd>
                </div>
                <div>
                  <dt className="mono muted">{t('daily')}</dt>
                  <dd className="num">{money(q.daily)}</dd>
                </div>
                <div>
                  <dt className="mono muted">{t('total_repay')}</dt>
                  <dd className="num">{money(q.total)}</dd>
                </div>
              </dl>
            )}

            <div className="ln-to" data-reveal>
              <span className="mono muted">{t('pay_out_to')}</span>
              <AccountPills accountId={acc?.id ?? ''} setAccountId={setAccountId} />
            </div>

            <div className="ln-go" data-reveal>
              <ErrorLine error={blocker || error} />
              <HoldButton
                label={busy ? t('processing') : t('borrow_amount', { amount: money(amount) })}
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
  const { cfg, t } = useBank();
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
      <svg viewBox="0 0 200 112" role="img" aria-label={t('credit_score_aria', { score, band: band.label })}>
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
        <span className="mono muted">{t('credit_score_range', { min: MIN, max: MAX })}</span>
      </div>
    </div>
  );
}

function PayDialog({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const { data, money, t } = useBank();
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
    <Dialog title={t('repay_loan')} onClose={onClose}>
      <form className="dialog-form" onSubmit={submit}>
        <AmountField amount={amount} setAmount={setAmount} invalid={over} />
        <div className="chips">
          <button type="button" className="chip" aria-pressed={amount === loan.dailyPayment} onClick={() => setAmount(Math.min(loan.dailyPayment, loan.remaining))}>
            {t('next_payment')} · {money(Math.min(loan.dailyPayment, loan.remaining))}
          </button>
          <button type="button" className="chip" aria-pressed={amount === loan.remaining} onClick={() => setAmount(loan.remaining)}>
            {t('pay_off')} · {money(loan.remaining)}
          </button>
        </div>
        <span className="mono muted">
          {t('repay_note', { name: acc?.name ?? '', amount: money(acc?.balance ?? 0) })}
        </span>
        <ErrorLine error={over ? t('err_not_enough') : error} />
        <SubmitButton busy={busy} disabled={!amount || over} icon="check">
          {t('pay_amount', { amount: money(Math.min(amount, loan.remaining)) })}
        </SubmitButton>
      </form>
    </Dialog>
  );
}
