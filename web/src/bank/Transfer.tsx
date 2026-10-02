import { useRef, useState, type FormEvent } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useBank } from '../store';
import { CountUp, HoldButton, Icon } from '../fx';
import { AmountField, ErrorLine, QuickAmounts, useAction } from '../ui';
import { AccountPills } from './Overview';
import type { SectionProps } from './Bank';

const STEPS = ['Recipient', 'Amount', 'Confirm'];
const QUICK = [100, 500, 1_000, 5_000];
const IBAN_RE = /^[A-Z0-9]{4,12}$/;
const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export function Transfer({ go, accountId, setAccountId }: SectionProps) {
  const { data, cfg, money } = useBank();
  const { busy, error, setError, run } = useAction();
  const root = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [contactName, setContactName] = useState('');
  const [sent, setSent] = useState<{ amount: number; to: string } | null>(null);

  const multi = cfg.features.multiTransfer;
  const from = data.accounts.find((a) => a.id === accountId) ?? data.accounts[0];
  const draftOk = IBAN_RE.test(draft) && draft !== from?.iban;
  const ibans = [...new Set([...picked, ...(draftOk ? [draft] : [])])];
  const nameOf = (iban: string) => data.contacts.find((c) => c.iban === iban)?.name ?? data.accounts.find((a) => a.iban === iban)?.name ?? iban;
  const toLabel = ibans.length > 1 ? `${nameOf(ibans[0])} +${ibans.length - 1} more` : ibans[0] ? nameOf(ibans[0]) : '';
  const total = amount * ibans.length;
  const over = !!from && total > from.balance;
  const after = (from?.balance ?? 0) - total;
  const canSave = cfg.features.contacts && draftOk && !data.contacts.some((c) => c.iban === draft) && !data.accounts.some((a) => a.iban === draft);
  const noAccess = from && !from.perms.transfer;

  useGSAP(
    () => {
      gsap.fromTo('.step-body > *', { opacity: 0, x: 32 }, { opacity: 1, x: 0, duration: 0.6, stagger: 0.04, ease: 'power3.out', overwrite: true, clearProps: 'opacity,transform' });
    },
    { scope: root, dependencies: [step] },
  );

  useGSAP(
    () => {
      if (!sent) return;
      gsap
        .timeline()
        .from('.sent', { opacity: 0, duration: 0.3 })
        .fromTo('.sent-ring', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.8, ease: 'expo.inOut' }, 0)
        .fromTo('.sent-check', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.5, ease: 'power3.out' }, 0.55)
        .from('.sent [data-in]', { opacity: 0, y: 16, stagger: 0.06, duration: 0.6, ease: 'power3.out' }, 0.6);
    },
    { scope: root, dependencies: [sent] },
  );

  if (!from) return <div className="panel empty">No account to send from.</div>;

  const pick = (iban: string) => {
    if (!multi) return setDraft(iban);
    setPicked((p) => (p.includes(iban) ? p.filter((x) => x !== iban) : [...p, iban]));
  };

  const next = (e: FormEvent) => {
    e.preventDefault();
    if (step === 0 && ibans.length) setStep(1);
    if (step === 1 && amount > 0 && !over && !noAccess) setStep(2);
  };

  const send = async () => {
    const r = await run('transfer', { accountId: from.id, ibans, amount, note: note.trim() }, 'chime');
    if (r.ok) setSent({ amount: total, to: ibans.map(nameOf).join(', ') });
  };

  const saveContact = async () => {
    const r = await run('contactSave', { name: contactName.trim(), iban: draft }, 'chime');
    if (r.ok) setContactName('');
  };

  const reset = () => {
    setSent(null);
    setStep(0);
    setDraft('');
    setPicked([]);
    setAmount(0);
    setNote('');
    setError('');
  };

  const recipients = [
    ...data.contacts.map((c) => ({ id: c.id, name: c.name, iban: c.iban, own: false })),
    ...data.accounts.filter((a) => a.id !== from.id).map((a) => ({ id: a.id, name: a.name, iban: a.iban, own: true })),
  ];

  return (
    <div ref={root} className="panel transfer">
      <div className="tf-main">
        <ol className="stepper" data-reveal>
          {STEPS.map((s, i) => (
            <li key={s} data-state={i < step ? 'done' : i === step ? 'current' : 'todo'}>
              <button type="button" disabled={i >= step} onClick={() => setStep(i)}>
                <span className="mono">{String(i + 1).padStart(2, '0')}</span> {s}
              </button>
            </li>
          ))}
        </ol>

        <form className="step-body" onSubmit={next} data-reveal>
          {step === 0 && (
            <>
              <h2 className="step-title">{multi ? 'Who are you paying? Pick one or more.' : 'Who are you paying?'}</h2>
              <div className="iban-row">
                <label className="field">
                  <span className="mono muted">Recipient IBAN</span>
                  <input
                    className="input input-lg mono"
                    placeholder={`${cfg.accounts.ibanPrefix}000000`}
                    value={draft}
                    maxLength={12}
                    onChange={(e) => setDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  />
                </label>
                {multi && (
                  <button
                    type="button"
                    className="btn btn-ghost iban-add"
                    disabled={!draftOk}
                    onClick={() => {
                      setPicked((p) => [...new Set([...p, draft])]);
                      setDraft('');
                    }}
                  >
                    <Icon name="plus" /> Add
                  </button>
                )}
              </div>

              {canSave && (
                <div className="save-contact">
                  <input className="input" placeholder="Name to save as" maxLength={24} value={contactName} onChange={(e) => setContactName(e.target.value)} />
                  <button type="button" className="btn btn-ghost" disabled={!contactName.trim() || busy} onClick={saveContact}>
                    <Icon name="user" /> Save contact
                  </button>
                </div>
              )}

              {multi && picked.length > 0 && (
                <div className="chips" aria-label="Recipients">
                  {picked.map((i) => (
                    <button key={i} type="button" className="chip chip-x" aria-label={`Remove ${nameOf(i)}`} onClick={() => pick(i)}>
                      {nameOf(i)} <Icon name="x" size={0.75} />
                    </button>
                  ))}
                </div>
              )}

              <div className="contacts">
                <span className="mono muted">{cfg.features.contacts ? 'Contacts & your accounts' : 'Your accounts'}</span>
                <ul>
                  {recipients
                    .filter((r) => r.own || cfg.features.contacts)
                    .map((r) => {
                      const on = multi ? picked.includes(r.iban) : draft === r.iban;
                      return (
                        <li key={r.id} className="contact-wrap">
                          <button type="button" className="contact" aria-pressed={on} onClick={() => pick(r.iban)}>
                            <span className={`avatar ${r.own ? 'avatar-own' : ''}`} aria-hidden="true">
                              {r.own ? <Icon name="card" size={1} /> : initials(r.name)}
                            </span>
                            <span>{r.name}</span>
                            <span className="mono muted">{r.own ? 'Your account' : r.iban}</span>
                          </button>
                          {!r.own && (
                            <button type="button" className="contact-del icon-btn" aria-label={`Delete contact ${r.name}`} onClick={() => run('contactDelete', { contactId: r.id })}>
                              <Icon name="trash" size={0.875} />
                            </button>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </div>
              <div className="step-actions">
                <ErrorLine error={draft === from.iban ? "That's the account you're sending from" : error} />
                <button className="btn btn-primary" disabled={!ibans.length}>
                  Continue{ibans.length > 1 ? ` · ${ibans.length} people` : ''} <Icon name="right" />
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h2 className="step-title">{ibans.length > 1 ? `How much each? (${ibans.length} people)` : 'How much?'}</h2>
              <AccountPills accountId={from.id} setAccountId={setAccountId} />
              <AmountField amount={amount} setAmount={setAmount} invalid={over} />
              <QuickAmounts values={QUICK} amount={amount} setAmount={setAmount} />
              <label className="field">
                <span className="mono muted">Note (optional)</span>
                <input className="input" maxLength={40} placeholder="What's it for?" value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <div className="step-actions">
                <ErrorLine error={noAccess ? "You don't have transfer access on this account" : over ? `Exceeds ${from.name} balance by ${money(total - from.balance)}` : ''} />
                <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>
                  Back
                </button>
                <button className="btn btn-primary" disabled={!amount || over || !!noAccess}>
                  Review <Icon name="right" />
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="step-title">
                Send {money(total)} to {toLabel}?
              </h2>
              <p className="muted step-lede">
                {ibans.length > 1 ? `${money(amount)} goes to each of ${ibans.length} people. ` : ''}Transfers to other players can't be reversed. Hold the button to confirm.
              </p>
              <div className="step-actions step-actions-col">
                <ErrorLine error={error} />
                <HoldButton label={busy ? 'Sending…' : `Send ${money(total)}`} disabled={busy} onConfirm={send} />
                <button type="button" className="btn btn-ghost" onClick={() => setStep(1)} disabled={busy}>
                  Edit amount
                </button>
              </div>
            </>
          )}
        </form>
      </div>

      <aside className="receipt" data-reveal aria-label="Transfer summary">
        <div className="receipt-head">
          <span className="mono muted">Transfer</span>
          <span className="mono muted">{new Date().toLocaleDateString('en-GB')}</span>
        </div>
        <dl>
          <div data-filled="true">
            <dt className="mono muted">From</dt>
            <dd>
              {from.name}
              <span className="mono muted">{from.iban}</span>
            </dd>
          </div>
          <div data-filled={ibans.length > 0}>
            <dt className="mono muted">To</dt>
            <dd>
              {toLabel || '—'}
              <span className="mono muted">{ibans.length === 1 ? ibans[0] : ibans.length > 1 ? `${ibans.length} recipients` : ''}</span>
            </dd>
          </div>
          <div data-filled={!!note.trim()}>
            <dt className="mono muted">Note</dt>
            <dd>{note.trim() || '—'}</dd>
          </div>
        </dl>
        <div className="receipt-total">
          <span className="mono muted">{ibans.length > 1 ? `Total · ${money(amount)} each` : 'Amount'}</span>
          <span className="receipt-amount num">{money(total)}</span>
        </div>
        <div className="receipt-after">
          <span className="mono muted">Balance after</span>
          <span className={`num ${after < 0 ? 'is-neg' : ''}`}>{money(after)}</span>
        </div>
        <div className="receipt-tear" aria-hidden="true" />
      </aside>

      {sent && (
        <div className="sent" role="status">
          <svg className="sent-mark" viewBox="0 0 120 120" aria-hidden="true">
            <circle className="sent-ring" cx="60" cy="60" r="54" pathLength={1} />
            <path className="sent-check" d="M38 62 53 76 83 45" pathLength={1} />
          </svg>
          <span className="mono muted" data-in>
            Transfer sent
          </span>
          <CountUp value={sent.amount} format={money} className="sent-amount" />
          <span className="sent-to" data-in>
            to {sent.to}
          </span>
          <div className="sent-actions" data-in>
            <button className="btn btn-ghost" onClick={reset}>
              New transfer
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                reset();
                go('overview');
              }}
            >
              Back to overview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
