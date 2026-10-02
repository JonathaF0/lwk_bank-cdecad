import { useEffect, useState, type FormEvent } from 'react';
import type { Account, AccountType, Member, Perms } from '../nui';
import { useBank } from '../store';
import { HoldButton, Icon } from '../fx';
import { Dialog, ErrorLine, SubmitButton, useAction } from '../ui';
import type { SectionProps } from './Bank';

const TYPE = { personal: 'Personal', business: 'Business', shared: 'Shared' } as const;
const PERMS: (keyof Perms)[] = ['deposit', 'withdraw', 'transfer', 'loans'];
const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function Accounts({ accountId, setAccountId }: SectionProps) {
  const { data, cfg, money } = useBank();
  const [creating, setCreating] = useState(false);
  const acc = data.accounts.find((a) => a.id === accountId) ?? data.accounts[0];
  const owned = data.accounts.filter((a) => a.role === 'owner').length;

  return (
    <div className="panel accounts">
      <div className="ac-list">
        <div className="section-head" data-reveal>
          <span className="mono muted">
            {data.accounts.length} accounts · you own {owned}/{cfg.accounts.maxOwned}
          </span>
          <button className="link mono" onClick={() => setCreating(true)} disabled={owned >= cfg.accounts.maxOwned}>
            + Open account
          </button>
        </div>
        <ul className="ac-cards">
          {data.accounts.map((a) => (
            <li key={a.id} data-reveal>
              <button className="ac-card" aria-pressed={a.id === acc?.id} onClick={() => setAccountId(a.id)}>
                <span className="ac-card-top">
                  <span className="mono">{TYPE[a.type]}</span>
                  <span className={`badge ${a.role === 'owner' ? 'is-active' : ''}`}>{a.role === 'owner' ? 'Owner' : 'Member'}</span>
                </span>
                <strong>{a.name}</strong>
                <span className="ac-card-bottom">
                  <span className="mono muted">{a.iban}</span>
                  <span className="num">{money(a.balance + a.savings)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <aside className="ac-detail">{acc ? <AccountDetail key={acc.id} acc={acc} /> : <p className="empty-note">No accounts yet.</p>}</aside>

      {creating && <CreateDialog onClose={() => setCreating(false)} onCreated={(id) => setAccountId(id)} />}
    </div>
  );
}

function AccountDetail({ acc }: { acc: Account }) {
  const { cfg, money } = useBank();
  const { busy, error, run } = useAction();
  const [name, setName] = useState(acc.name);
  const [ibanOpen, setIbanOpen] = useState(false);
  const [playerId, setPlayerId] = useState('');
  const owner = acc.role === 'owner';
  const hasMembers = acc.type !== 'personal';

  useEffect(() => setName(acc.name), [acc.name]);

  const rename = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && name.trim() !== acc.name) run('accountRename', { accountId: acc.id, name: name.trim() }, 'chime');
  };

  const addMember = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run('memberAdd', { accountId: acc.id, playerId: playerId.trim() }, 'chime');
    if (r.ok) setPlayerId('');
  };

  const setPerm = (m: Member, key: keyof Perms) => run('memberPerms', { accountId: acc.id, memberId: m.id, perms: { ...m.perms, [key]: !m.perms[key] } });

  return (
    <div className="ac-body">
      <form className="ac-rename" onSubmit={rename} data-reveal>
        <input className="input input-title" value={name} maxLength={28} disabled={!owner} onChange={(e) => setName(e.target.value)} aria-label="Account name" />
        {owner && name.trim() !== acc.name && (
          <button className="btn btn-primary btn-sm" disabled={busy || !name.trim()}>
            Save
          </button>
        )}
      </form>

      <dl className="ac-facts" data-reveal>
        <div>
          <dt className="mono muted">IBAN</dt>
          <dd className="mono">
            {acc.iban}
            {owner && cfg.features.customIban && (
              <button className="icon-btn" aria-label="Customize IBAN" onClick={() => setIbanOpen(true)}>
                <Icon name="edit" size={0.875} />
              </button>
            )}
          </dd>
        </div>
        <div>
          <dt className="mono muted">Type</dt>
          <dd>{TYPE[acc.type]}</dd>
        </div>
        <div>
          <dt className="mono muted">Opened</dt>
          <dd>{date.format(acc.openedAt)}</dd>
        </div>
        <div>
          <dt className="mono muted">Checking · savings</dt>
          <dd className="num">
            {money(acc.balance)} · {money(acc.savings + acc.goals.reduce((s, g) => s + g.saved, 0))}
          </dd>
        </div>
      </dl>

      {!owner && (
        <div className="kv" data-reveal>
          <span className="mono muted">Your access</span>
          <div className="perm-row">
            {PERMS.map((p) => (
              <span key={p} className={`perm ${acc.perms[p] ? 'is-on' : ''}`}>
                <Icon name={acc.perms[p] ? 'check' : 'x'} size={0.75} /> {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasMembers && (
        <div className="ac-members" data-reveal>
          <div className="section-head">
            <span className="mono muted">
              <Icon name="users" size={0.875} /> Members · {acc.members.length}
            </span>
          </div>
          <ul>
            {acc.members.map((m) => (
              <li key={m.id} className="member">
                <span className="avatar" aria-hidden="true">
                  {m.name
                    .split(/\s+/)
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join('')}
                </span>
                <span className="member-name">
                  {m.name}
                  <span className="mono muted">{m.role}</span>
                </span>
                <span className="perm-row" role="group" aria-label={`${m.name} permissions`}>
                  {PERMS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`perm ${m.perms[p] ? 'is-on' : ''}`}
                      aria-pressed={m.perms[p]}
                      disabled={!owner || m.role === 'owner' || busy}
                      onClick={() => setPerm(m, p)}
                      data-sound="toggle"
                    >
                      {p}
                    </button>
                  ))}
                </span>
                {owner && m.role !== 'owner' && (
                  <button className="icon-btn" aria-label={`Remove ${m.name}`} disabled={busy} onClick={() => run('memberRemove', { accountId: acc.id, memberId: m.id })}>
                    <Icon name="x" size={1} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {owner && (
            <form className="member-add" onSubmit={addMember}>
              <input className="input" inputMode="numeric" placeholder="Player server ID" value={playerId} onChange={(e) => setPlayerId(e.target.value.replace(/\D/g, ''))} />
              <button className="btn btn-ghost" disabled={!playerId || busy}>
                <Icon name="plus" /> Add member
              </button>
            </form>
          )}
        </div>
      )}

      <ErrorLine error={error} />

      {owner && acc.type !== 'business' && (
        <div className="card-danger" data-reveal>
          <HoldButton label="Close account" variant="danger" disabled={busy} onConfirm={() => run('accountDelete', { accountId: acc.id })} />
        </div>
      )}

      {ibanOpen && <IbanDialog acc={acc} onClose={() => setIbanOpen(false)} />}
    </div>
  );
}

function IbanDialog({ acc, onClose }: { acc: Account; onClose: () => void }) {
  const { cfg, money } = useBank();
  const { busy, error, run } = useAction();
  const [iban, setIban] = useState(acc.iban);
  const valid = /^[A-Z0-9]{4,12}$/.test(iban);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run('accountIban', { accountId: acc.id, iban }, 'chime');
    if (r.ok) onClose();
  };

  return (
    <Dialog title="Custom IBAN" onClose={onClose}>
      <form className="dialog-form" onSubmit={submit}>
        <label className="field">
          <span className="mono muted">4–12 letters or numbers</span>
          <input autoFocus className="input input-lg mono" maxLength={12} value={iban} onChange={(e) => setIban(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
        </label>
        <p className="muted small">
          Anyone who saved your old IBAN will need the new one. Costs {money(cfg.accounts.ibanFee)}, charged to {acc.name}.
        </p>
        <ErrorLine error={error} />
        <SubmitButton busy={busy} disabled={!valid || iban === acc.iban} icon="edit">
          Change IBAN · {money(cfg.accounts.ibanFee)}
        </SubmitButton>
      </form>
    </Dialog>
  );
}

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { cfg, money } = useBank();
  const { busy, error, run } = useAction();
  const [type, setType] = useState<AccountType>('personal');
  const [name, setName] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run('accountCreate', { type, name: name.trim() }, 'chime');
    if (r.ok) {
      const created = r.data.accounts[r.data.accounts.length - 1];
      if (created) onCreated(created.id);
      onClose();
    }
  };

  return (
    <Dialog title="Open an account" onClose={onClose}>
      <form className="dialog-form" onSubmit={submit}>
        <div className="seg" role="tablist" aria-label="Account type">
          {(['personal', 'shared'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={type === t} onClick={() => setType(t)}>
              {TYPE[t]}
            </button>
          ))}
        </div>
        <p className="muted small">{type === 'shared' ? 'Add members and choose exactly what each of them can do.' : 'A second account just for you, e.g. for a business on the side.'}</p>
        <label className="field">
          <span className="mono muted">Account name</span>
          <input autoFocus className="input" maxLength={28} placeholder={type === 'shared' ? 'e.g. Crew fund' : 'e.g. Rainy day'} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <ErrorLine error={error} />
        <SubmitButton busy={busy} disabled={!name.trim()} icon="plus">
          Open account{cfg.accounts.creationFee ? ` · ${money(cfg.accounts.creationFee)} cash` : ''}
        </SubmitButton>
      </form>
    </Dialog>
  );
}
