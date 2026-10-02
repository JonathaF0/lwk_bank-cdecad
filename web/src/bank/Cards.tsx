import { useEffect, useState, type FormEvent } from 'react';
import type { Card, CardTier } from '../nui';
import { useBank } from '../store';
import { HoldButton, Icon } from '../fx';
import { cardExpiry, daysUntil } from '../logic';
import { Dialog, ErrorLine, Progress, SubmitButton, Toggle, useAction } from '../ui';
import { Card3D } from '../atm/Card3D';
import { AccountPills } from './Overview';
import type { SectionProps } from './Bank';

const TIERS: CardTier[] = ['standard', 'premium', 'gold'];
const title = (s: string) => s[0].toUpperCase() + s.slice(1);
const STATUS = { active: 'Active', blocked: 'Frozen', inactive: 'Not activated' } as const;

export function Cards({ active, accountId, setAccountId }: SectionProps) {
  const { data, cfg } = useBank();
  const [cardId, setCardId] = useState(data.cards[0]?.id);
  const [ordering, setOrdering] = useState(false);
  const card = data.cards.find((c) => c.id === cardId) ?? data.cards[0];

  useEffect(() => {
    if (card && card.id !== cardId) setCardId(card.id);
  }, [card, cardId]);

  const activeCount = data.cards.filter((c) => c.status === 'active').length;
  const full = data.cards.length >= cfg.cards.maxCards;

  return (
    <div className="panel cards">
      <div className="cards-main">
        <div className="cards-stage" data-reveal>
          {card ? (
            // WebGL only while this panel is in front.
            active ? <Card3D card={card} bankName={cfg.bankName} accent={cfg.accent} /> : null
          ) : (
            <div className="empty-state">
              <Icon name="card" size={2} />
              <p>No cards yet. Order one to pay and use ATMs.</p>
            </div>
          )}
          <span className="mono muted cards-hint">Move to tilt · click to flip</span>
        </div>

        <div className="card-strip" data-reveal>
          {data.cards.map((c) => (
            <button key={c.id} className="card-chip" aria-pressed={c.id === card?.id} onClick={() => setCardId(c.id)}>
              <span className={`card-swatch tier-${c.tier}`} aria-hidden="true" />
              <span className="mono">··{c.last4}</span>
              <span className={`dot is-${c.status}`} aria-label={STATUS[c.status]} />
            </button>
          ))}
          <button className="card-chip card-chip-add" onClick={() => setOrdering(true)} disabled={full} title={full ? `Limit of ${cfg.cards.maxCards} cards reached` : undefined}>
            <Icon name="plus" /> Order card
          </button>
        </div>
      </div>

      <aside className="cards-side">
        <div className="section-head" data-reveal>
          <span className="mono muted">
            {data.cards.length}/{cfg.cards.maxCards} cards · {activeCount}/{cfg.cards.maxActive} active
          </span>
        </div>
        {card ? <CardDetails key={card.id} card={card} /> : <p className="empty-note">Your cards will show up here.</p>}
      </aside>

      {ordering && <OrderDialog accountId={accountId} setAccountId={setAccountId} onClose={() => setOrdering(false)} />}
    </div>
  );
}

function CardDetails({ card }: { card: Card }) {
  const { data, cfg, money } = useBank();
  const { busy, error, run } = useAction();
  const [limit, setLimit] = useState(card.dailyLimit);
  const [pinOpen, setPinOpen] = useState(false);
  const acc = data.accounts.find((a) => a.id === card.accountId);
  const tierMax = cfg.cards.tiers[card.tier].dailyLimit;
  const days = daysUntil(card.expiresAt);
  const expiringSoon = days <= 14;

  useEffect(() => setLimit(card.dailyLimit), [card.dailyLimit]);

  return (
    <div className="card-details">
      <div className="card-title" data-reveal>
        <h2>
          {title(card.tier)} <span className="mono muted">·· {card.last4}</span>
        </h2>
        <span className={`badge is-${card.status}`}>{STATUS[card.status]}</span>
      </div>
      <span className="mono muted" data-reveal>
        {acc?.name ?? 'Unlinked'} · {card.holder}
      </span>

      {card.status === 'inactive' ? (
        <div className="callout" data-reveal>
          <p>Activate this card to use it at ATMs and stores.</p>
          <button className="btn btn-primary" disabled={busy} onClick={() => run('cardActivate', { cardId: card.id }, 'chime')}>
            <Icon name="check" /> Activate · {money(cfg.cards.activationFee)}
          </button>
        </div>
      ) : (
        <div className="kv" data-reveal>
          <div className="kv-row">
            <span className="mono muted">Spent today</span>
            <span className="num">
              {money(card.spentToday)} <span className="muted">of {money(card.dailyLimit)}</span>
            </span>
          </div>
          <Progress value={card.spentToday} max={card.dailyLimit} label="Daily spend" tone={card.spentToday / card.dailyLimit > 0.85 ? 'warn' : undefined} />
        </div>
      )}

      {cfg.features.customCardLimits && (
        <div className="kv" data-reveal>
          <label className="kv-row" htmlFor={`limit-${card.id}`}>
            <span className="mono muted">Daily limit</span>
            <span className="num">{money(limit)}</span>
          </label>
          <input
            id={`limit-${card.id}`}
            type="range"
            className="range"
            min={0}
            max={tierMax}
            step={Math.max(100, Math.round(tierMax / 100 / 100) * 100)}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
          {limit !== card.dailyLimit && (
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run('cardLimit', { cardId: card.id, limit }, 'chime')}>
              Save limit
            </button>
          )}
        </div>
      )}

      <div className="kv" data-reveal>
        <div className="kv-row">
          <span className="mono muted">Expires</span>
          <span className={expiringSoon ? 'is-warn' : ''}>
            {cardExpiry(card.expiresAt)} · {days > 0 ? `${days} days left` : 'Expired'}
          </span>
        </div>
        <div className="kv-actions">
          <Toggle checked={card.autoRenew} label="Auto-renew" disabled={busy} onChange={(v) => run('cardAutoRenew', { cardId: card.id, enabled: v })} />
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run('cardRenew', { cardId: card.id }, 'chime')}>
            Renew · {money(cfg.cards.renewalFee)}
          </button>
        </div>
      </div>

      <div className="kv-actions" data-reveal>
        {card.status !== 'inactive' && (
          <Toggle checked={card.status === 'blocked'} label="Freeze card" disabled={busy} onChange={(v) => run('cardBlock', { cardId: card.id, blocked: v })} />
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => setPinOpen(true)}>
          <Icon name="lock" size={1} /> Change PIN
        </button>
      </div>

      <ErrorLine error={error} />

      <div className="card-danger" data-reveal>
        <HoldButton label="Destroy card" onConfirm={() => run('cardDelete', { cardId: card.id })} disabled={busy} variant="danger" />
      </div>

      {pinOpen && <PinDialog card={card} onClose={() => setPinOpen(false)} />}
    </div>
  );
}

function PinDialog({ card, onClose }: { card: Card; onClose: () => void }) {
  const { busy, error, setError, run } = useAction();
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const digits = (s: string) => s.replace(/\D/g, '').slice(0, 4);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pin !== again) return setError("The PINs don't match");
    const r = await run('cardPin', { cardId: card.id, pin }, 'chime');
    if (r.ok) onClose();
  };

  return (
    <Dialog title={`New PIN · ·· ${card.last4}`} onClose={onClose}>
      <form className="dialog-form" onSubmit={submit}>
        <label className="field">
          <span className="mono muted">New PIN</span>
          <input autoFocus className="input input-lg mono pin-input" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(digits(e.target.value))} />
        </label>
        <label className="field">
          <span className="mono muted">Repeat PIN</span>
          <input className="input input-lg mono pin-input" type="password" inputMode="numeric" value={again} onChange={(e) => setAgain(digits(e.target.value))} />
        </label>
        <ErrorLine error={error} />
        <SubmitButton busy={busy} disabled={pin.length !== 4 || again.length !== 4} icon="lock">
          Set PIN
        </SubmitButton>
      </form>
    </Dialog>
  );
}

function OrderDialog({ accountId, setAccountId, onClose }: Pick<SectionProps, 'accountId' | 'setAccountId'> & { onClose: () => void }) {
  const { cfg, money } = useBank();
  const { busy, error, run } = useAction();
  const [tier, setTier] = useState<CardTier>('standard');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run('cardOrder', { accountId, tier }, 'printer');
    if (r.ok) onClose();
  };

  return (
    <Dialog title="Order a card" onClose={onClose} wide>
      <form className="dialog-form" onSubmit={submit}>
        <span className="mono muted">Linked account</span>
        <AccountPills accountId={accountId} setAccountId={setAccountId} />
        <div className="tier-grid" role="radiogroup" aria-label="Card type">
          {TIERS.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tier === t} className="tier-opt" onClick={() => setTier(t)}>
              <span className={`tier-face tier-${t}`} aria-hidden="true">
                <span className="mono">{cfg.bankName}</span>
              </span>
              <strong>{title(t)}</strong>
              <span className="mono muted">{money(cfg.cards.tiers[t].dailyLimit)} / day</span>
              <span className="num">{money(cfg.cards.tiers[t].fee)}</span>
            </button>
          ))}
        </div>
        <p className="muted small">
          New cards arrive inactive and are valid for {cfg.cards.validDays} days. Activation costs {money(cfg.cards.activationFee)}.
        </p>
        <ErrorLine error={error} />
        <SubmitButton busy={busy} icon="card">
          Order {title(tier)} · {money(cfg.cards.tiers[tier].fee)}
        </SubmitButton>
      </form>
    </Dialog>
  );
}
