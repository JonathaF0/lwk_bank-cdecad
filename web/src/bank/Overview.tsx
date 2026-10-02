import { useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { isIncoming, useBank } from '../store';
import { CountUp, Icon } from '../fx';
import { TxRow } from './TxList';
import { MoneyDialog } from './MoneyDialog';
import type { SectionProps } from './Bank';

const TYPE_LABEL = { personal: 'Personal', business: 'Business', shared: 'Shared' } as const;

export function AccountPills({ accountId, setAccountId }: Pick<SectionProps, 'accountId' | 'setAccountId'>) {
  const { data } = useBank();
  return (
    <div className="acct-pills" role="group" aria-label="Account" data-reveal>
      {data.accounts.map((a) => (
        <button key={a.id} className="acct-pill" aria-pressed={a.id === accountId} onClick={() => setAccountId(a.id)}>
          <span className="mono">{TYPE_LABEL[a.type]}</span>
          {a.name}
        </button>
      ))}
    </div>
  );
}

/** NUI has no async clipboard permission; the legacy command still works in CEF. */
function copyText(text: string) {
  const el = document.createElement('textarea');
  el.value = text;
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  el.remove();
}

export function Overview({ go, accountId, setAccountId, active }: SectionProps) {
  const { data, cfg, money } = useBank();
  const [dialog, setDialog] = useState<'deposit' | 'withdraw' | null>(null);
  const [copied, setCopied] = useState(false);
  const acc = data.accounts.find((a) => a.id === accountId) ?? data.accounts[0];

  const { recent, inWeek, outWeek } = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86_400_000;
    const mine = data.transactions.filter((t) => t.accountId === acc?.id);
    const week = mine.filter((t) => t.date >= weekAgo);
    return {
      recent: mine.slice(0, 5),
      inWeek: week.filter((t) => isIncoming(t.type)).reduce((s, t) => s + t.amount, 0),
      outWeek: week.filter((t) => !isIncoming(t.type)).reduce((s, t) => s + t.amount, 0),
    };
  }, [data.transactions, acc?.id]);

  if (!acc) return <div className="panel empty">No accounts yet.</div>;

  const hist = acc.history?.length ? acc.history : [acc.balance];
  const change = hist[hist.length - 1] - hist[0];

  const copy = () => {
    copyText(acc.iban);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="panel overview">
      <div className="ov-main">
        <AccountPills accountId={acc.id} setAccountId={setAccountId} />

        <div className="ov-balance">
          <div className="mono muted" data-reveal>
            Available balance
          </div>
          <CountUp key={acc.id} value={acc.balance} format={money} className="balance-xl" />
          <div className="ov-meta" data-reveal>
            <span className={`delta ${change >= 0 ? 'is-up' : 'is-down'}`}>
              <Icon name={change >= 0 ? 'out' : 'in'} size={0.875} />
              {money(change, { sign: true })}
              <span className="mono muted">7 days</span>
            </span>
            <button className="iban" onClick={copy} aria-label={`Copy IBAN ${acc.iban}`}>
              <span className="mono muted">IBAN</span>
              <span className="mono">{acc.iban}</span>
              <Icon name={copied ? 'check' : 'copy'} size={0.875} />
              <span className="mono iban-copied" aria-live="polite">
                {copied ? 'Copied' : ''}
              </span>
            </button>
          </div>
        </div>

        <Sparkline values={hist} play={active} />

        <dl className="ov-stats" data-reveal>
          <div>
            <dt className="mono muted">In · 7d</dt>
            <dd className="num">{money(inWeek, { sign: true })}</dd>
          </div>
          <div>
            <dt className="mono muted">Out · 7d</dt>
            <dd className="num">{money(-outWeek)}</dd>
          </div>
          {cfg.features.savings && (
            <div>
              <dt className="mono muted">Savings</dt>
              <dd className="num">{money(acc.savings + acc.goals.reduce((s, g) => s + g.saved, 0))}</dd>
            </div>
          )}
          <div>
            <dt className="mono muted">Cash on hand</dt>
            <dd className="num">{money(data.player.cash)}</dd>
          </div>
        </dl>
      </div>

      <aside className="ov-side">
        <div className="actions" data-reveal>
          <button className="action" onClick={() => setDialog('deposit')} disabled={!acc.perms.deposit}>
            <Icon name="in" size={1.25} />
            <span>Deposit</span>
            <span className="mono muted">Cash → bank</span>
          </button>
          <button className="action" onClick={() => setDialog('withdraw')} disabled={!acc.perms.withdraw}>
            <Icon name="out" size={1.25} />
            <span>Withdraw</span>
            <span className="mono muted">Bank → cash</span>
          </button>
          <button className="action action-wide" onClick={() => go('transfer')} disabled={!acc.perms.transfer}>
            <Icon name="send" size={1.25} />
            <span>Send money</span>
            <span className="mono muted">IBAN or contact</span>
          </button>
        </div>

        <div className="ov-recent">
          <div className="section-head" data-reveal>
            <span className="mono muted">Recent</span>
            <button className="link mono" onClick={() => go('activity')}>
              All activity →
            </button>
          </div>
          {recent.length ? (
            <ul className="tx-list">
              {recent.map((t) => (
                <TxRow key={t.id} tx={t} />
              ))}
            </ul>
          ) : (
            <p className="empty-note" data-reveal>
              No transactions on this account yet.
            </p>
          )}
        </div>
      </aside>

      {dialog && <MoneyDialog kind={dialog} account={acc} onClose={() => setDialog(null)} />}
    </div>
  );
}

/* ---------- Sparkline ---------- */

const W = 600;
const H = 120;

function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return `M0 ${pts[0]?.[1] ?? H / 2} H${W}`;
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1] ?? pts[i];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const [x3, y3] = pts[i + 2] ?? pts[i + 1];
    d += ` C${x1 + (x2 - x0) / 6} ${y1 + (y2 - y0) / 6} ${x2 - (x3 - x1) / 6} ${y2 - (y3 - y1) / 6} ${x2} ${y2}`;
  }
  return d;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Sparkline({ values, play }: { values: number[]; play: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const pts = values.map((v, i): [number, number] => [(i / Math.max(values.length - 1, 1)) * W, H - 10 - ((v - min) / span) * (H - 30)]);
  const line = smoothPath(pts);
  const last = pts[pts.length - 1];
  const today = new Date().getDay();
  const labels = values.map((_, i) => DAYS[(today - (values.length - 1 - i) + 7 * 7) % 7]);

  useGSAP(
    () => {
      if (!play) return;
      gsap.fromTo('.spark-line', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.6, ease: 'expo.inOut', delay: 0.5 });
      gsap.fromTo('.spark-area', { opacity: 0 }, { opacity: 1, duration: 1, delay: 1.2 });
      gsap.fromTo('.spark-dot', { scale: 0 }, { scale: 1, duration: 0.6, ease: 'back.out(3)', delay: 1.8 });
    },
    { scope: root, dependencies: [line, play] },
  );

  return (
    <div ref={root} className="spark" data-reveal>
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="spark-area" d={`${line} L${W} ${H} L0 ${H} Z`} fill="url(#spark-fill)" />
        <path className="spark-line" d={line} pathLength={1} strokeDasharray="1" fill="none" stroke="var(--accent)" strokeWidth="2" />
      </svg>
      <span className="spark-dot" style={{ left: `${(last[0] / W) * 100}%`, top: `${(last[1] / H) * 100}%` }} />
      <div className="spark-days mono muted" aria-hidden="true">
        {labels.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
    </div>
  );
}
