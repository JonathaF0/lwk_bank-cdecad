import { useEffect, useRef, useState, type FormEvent } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { fetchNui, type Card } from '../nui';
import { parseAmount, useBank } from '../store';
import { Brand, CountUp, Icon, Scramble } from '../fx';
import { Card3D, type Card3DHandle } from './Card3D';
import { play } from '../sound';

type Step = 'card' | 'pin' | 'menu';
const QUICK = [100, 200, 500, 1_000, 2_500];

export function Atm({ onClose }: { onClose: () => void }) {
  const { data } = useBank();
  const root = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>('card');
  const [cardId, setCardId] = useState(data.cards.find((c) => c.status === 'active')?.id ?? data.cards[0]?.id);
  const card = data.cards.find((c) => c.id === cardId);

  useGSAP(
    () => {
      gsap.fromTo('[data-step] [data-in]', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.05, ease: 'power3.out', delay: step === 'card' ? 0.5 : 0.1, overwrite: true, clearProps: 'opacity,transform' });
    },
    { scope: root, dependencies: [step] },
  );

  return (
    <div ref={root} className="atm">
      <header className="hud hud-top">
        <Brand name={data.config.bankName} suffix="ATM · 24h" />

        <div className="mono muted" data-hud>
          <Scramble text={step === 'card' ? 'Select card' : step === 'pin' ? 'Verify PIN' : 'Withdraw · deposit'} key={step} />
        </div>
        <button className="mono esc" onClick={onClose} data-hud>
          <kbd>Esc</kbd> {step === 'card' ? 'Close' : 'Eject card'}
        </button>
      </header>

      <div className="atm-shell" data-stage>
        {!card ? (
          <div className="atm-empty" data-step>
            <Icon name="card" size={2.5} />
            <h2 data-in>No bank card</h2>
            <p className="muted" data-in>
              You need a card to use this ATM. Get one from any {data.config.bankName} branch.
            </p>
            <div data-in>
              <button className="btn btn-ghost" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : step === 'card' ? (
          <CardStep cards={data.cards} card={card} setCardId={setCardId} onInserted={() => setStep('pin')} />
        ) : step === 'pin' ? (
          <PinStep card={card} onOk={() => setStep('menu')} />
        ) : (
          <MenuStep card={card} onDone={() => (play('cardOut'), onClose())} />
        )}
      </div>
    </div>
  );
}

/* ---------- 1. choose + insert card ---------- */

function CardStep({ cards, card, setCardId, onInserted }: { cards: Card[]; card: Card; setCardId: (id: string) => void; onInserted: () => void }) {
  const { data } = useBank();
  const card3d = useRef<Card3DHandle>(null);
  const [inserting, setInserting] = useState(false);
  const blocked = card.status !== 'active';

  const insert = async () => {
    setInserting(true);
    play('cardIn');
    await card3d.current?.insert();
    onInserted();
  };

  return (
    <div className="atm-card" data-step>
      <div className="atm-stage">
        <Card3D ref={card3d} card={card} bankName={data.config.bankName} accent={data.config.accent} />
        <div className={`slot-line ${inserting ? 'is-hot' : ''}`} aria-hidden="true" />
        <span className="mono muted atm-hint">Move to tilt · click to flip</span>
      </div>

      <div className="atm-side">
        <h2 className="atm-title" data-in>
          Insert your card
        </h2>
        <ul className="card-list" data-in>
          {cards.map((c) => {
            const acc = data.accounts.find((a) => a.id === c.accountId);
            return (
              <li key={c.id}>
                <button className="card-row" aria-pressed={c.id === card.id} disabled={inserting} onClick={() => setCardId(c.id)}>
                  <span className={`card-swatch tier-${c.tier}`} aria-hidden="true" />
                  <span className="card-row-main">
                    <span>
                      {c.tier[0].toUpperCase() + c.tier.slice(1)} · •• {c.last4}
                    </span>
                    <span className="mono muted">{acc?.name ?? 'Unlinked'}</span>
                  </span>
                  {c.status !== 'active' && <span className="badge-blocked mono">{c.status === 'blocked' ? 'Frozen' : 'Inactive'}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="atm-actions" data-in>
          {blocked && (
            <p className="error-text">
              <Icon name="alert" size={1} /> {card.status === 'blocked' ? 'This card is frozen. Unfreeze it in the bank app.' : 'Activate this card in the bank app first.'}
            </p>
          )}
          <button className="btn btn-primary btn-block" disabled={blocked || inserting} onClick={insert}>
            <Icon name="card" /> {inserting ? 'Reading card…' : 'Insert card'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 2. PIN ---------- */

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

function PinStep({ card, onOk }: { card: Card; onOk: () => void }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dots = useRef<HTMLDivElement>(null);
  const okRef = useRef(onOk);
  okRef.current = onOk;

  const press = (k: string) => {
    if (busy) return;
    // Played here, not on pointerdown, so typed digits beep too.
    play('keypad');
    setError('');
    if (k === 'clear') return setPin('');
    if (k === 'back') return setPin((p) => p.slice(0, -1));
    setPin((p) => (p.length < 4 ? p + k : p));
  };

  useEffect(() => {
    if (pin.length !== 4) return;
    let live = true;
    setBusy(true);
    fetchNui<{ ok: boolean; error?: string }>('verifyPin', { cardId: card.id, pin })
      .catch(() => ({ ok: false, error: 'Card reader error. Try again.' }))
      .then((r) => {
        if (!live) return;
        setBusy(false);
        if (r.ok) return okRef.current();
        setError(r.error ?? 'Incorrect PIN');
        setPin('');
        gsap.fromTo(dots.current, { x: -12 }, { x: 0, duration: 0.6, ease: 'elastic.out(1.2, 0.25)' });
      });
    return () => {
      live = false;
    };
  }, [pin, card.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      if (e.key === 'Backspace') press('back');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="atm-pin" data-step>
      <div className="pin-info">
        <span className="mono muted" data-in>
          Card •• {card.last4}
        </span>
        <h2 className="atm-title" data-in>
          Enter your PIN
        </h2>
        <div ref={dots} className="pin-dots" data-in role="status" aria-label={`${pin.length} of 4 digits entered`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={i < pin.length ? 'is-on' : ''} />
          ))}
        </div>
        <p className="error-text" role="alert" data-in>
          {error && <Icon name="alert" size={1} />} {busy ? 'Checking…' : error}
        </p>
        <span className="mono muted" data-in>
          Shield the keypad · type or click
        </span>
      </div>
      <div className="keypad" data-in>
        {KEYS.map((k) => (
          <button key={k} className={`key ${k.length > 1 ? 'key-fn' : ''}`} onClick={() => press(k)} disabled={busy} data-sound="none" aria-label={k === 'back' ? 'Delete digit' : k === 'clear' ? 'Clear PIN' : k}>
            {k === 'back' ? <Icon name="left" /> : k === 'clear' ? <span className="mono">Clr</span> : k}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- 3. withdraw / deposit ---------- */

function MenuStep({ card, onDone }: { card: Card; onDone: () => void }) {
  const { data, act, money } = useBank();
  const acc = data.accounts.find((a) => a.id === card.accountId);
  const [mode, setMode] = useState<'withdraw' | 'deposit'>('withdraw');
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cash, setCash] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (cash === null) return;
      gsap
        .timeline({ onComplete: () => setCash(null) })
        .from('.bill', { yPercent: -110, duration: 0.7, stagger: 0.09, ease: 'power3.out' })
        .from('.dispense [data-in]', { opacity: 0, y: 12, stagger: 0.06, duration: 0.5 }, 0.2)
        .to('.dispense', { opacity: 0, duration: 0.4 }, '+=1.6');
    },
    { scope: root, dependencies: [cash] },
  );

  if (!acc) return <div className="atm-empty">This card isn't linked to an account.</div>;

  const max = mode === 'withdraw' ? acc.balance : data.player.cash;
  const amount = parseAmount(raw);

  const run = async (value: number) => {
    if (!value || value > max || busy) return;
    setBusy(true);
    setError('');
    const r = await act(mode, { accountId: acc.id, amount: value, atm: true }, 'counter');
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setRaw('');
    if (mode === 'withdraw') setCash(value);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(amount);
  };

  return (
    <div ref={root} className="atm-menu" data-step>
      <div className="atm-bal">
        <span className="mono muted" data-in>
          {acc.name} · •• {card.last4}
        </span>
        <CountUp value={acc.balance} format={money} className="balance-xl" />
        <span className="muted" data-in>
          Cash on hand <strong className="num">{money(data.player.cash)}</strong>
        </span>
        {/* GSAP animates the wrapper: .btn's own CSS transitions would fight the tween. */}
        <div className="atm-done" data-in>
          <button className="btn btn-ghost" onClick={onDone}>
            <Icon name="card" /> Take card & finish
          </button>
        </div>
      </div>

      <div className="atm-ops" data-in>
        <div className="seg" role="tablist" aria-label="Operation">
          {(['withdraw', 'deposit'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setError('');
                setRaw('');
              }}
            >
              {m === 'withdraw' ? 'Withdraw' : 'Deposit'}
            </button>
          ))}
        </div>

        <div className="quick-grid">
          {QUICK.map((q) => (
            <button key={q} className="quick" disabled={busy || q > max} onClick={() => run(q)}>
              <span className="num">{money(q)}</span>
            </button>
          ))}
          <button className="quick quick-max" disabled={busy || max <= 0} onClick={() => run(max)}>
            <span className="mono">All</span>
            <span className="num">{money(max)}</span>
          </button>
        </div>

        <form className="other" onSubmit={submit}>
          <label className="search">
            <span className="sr-only">Other amount</span>
            <span className="other-prefix" aria-hidden="true">
              $
            </span>
            <input className="input" inputMode="numeric" placeholder="Other amount" value={amount ? amount.toLocaleString('en-US') : ''} onChange={(e) => setRaw(e.target.value)} />
          </label>
          <button className="btn btn-primary" disabled={!amount || amount > max || busy} aria-busy={busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name={mode === 'withdraw' ? 'out' : 'in'} />}
            {mode === 'withdraw' ? 'Withdraw' : 'Deposit'}
          </button>
        </form>
        <p className="error-text" role="alert">
          {(error || amount > max) && <Icon name="alert" size={1} />}
          {amount > max ? (mode === 'withdraw' ? 'Not enough in this account' : `You only have ${money(max)} cash`) : error}
        </p>
      </div>

      {cash !== null && (
        <div className="dispense" role="status">
          <div className="dispense-slot" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="bill" style={{ ['--r' as string]: `${(i - 2) * 3}deg` }}>
                <span>$</span>
              </span>
            ))}
          </div>
          <span className="mono muted" data-in>
            Take your cash
          </span>
          <span className="dispense-amount num" data-in>
            {money(cash)}
          </span>
        </div>
      )}
    </div>
  );
}
