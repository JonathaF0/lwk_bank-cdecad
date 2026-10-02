import { useState, type FormEvent } from 'react';
import type { Goal } from '../nui';
import { useBank } from '../store';
import { CountUp, Icon } from '../fx';
import { timeUntil } from '../logic';
import { AmountField, Dialog, ErrorLine, Progress, SubmitButton, useAction } from '../ui';
import { AccountPills } from './Overview';
import type { SectionProps } from './Bank';

export function Savings({ accountId, setAccountId }: SectionProps) {
  const { data, cfg, money } = useBank();
  const { busy, error, run } = useAction();
  const [dir, setDir] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState(0);
  const [newGoal, setNewGoal] = useState(false);
  const [moving, setMoving] = useState<{ goal: Goal; dir: 'in' | 'out' } | null>(null);
  const acc = data.accounts.find((a) => a.id === accountId) ?? data.accounts[0];
  if (!acc) return <div className="panel empty">No accounts yet.</div>;

  const inGoals = acc.goals.reduce((s, g) => s + g.saved, 0);
  const total = acc.savings + inGoals;
  const rate = cfg.savingsRates[acc.type];
  const max = dir === 'in' ? acc.balance : acc.savings;
  const over = amount > max;
  const history = acc.interestHistory.slice(-8);
  const peak = Math.max(...history.map((h) => h.amount), 1);
  const allowed = dir === 'in' ? acc.perms.deposit : acc.perms.withdraw;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!amount || over) return;
    const r = await run('savingsMove', { accountId: acc.id, amount, direction: dir }, 'chime');
    if (r.ok) setAmount(0);
  };

  return (
    <div className="panel savings">
      <div className="sv-main">
        <AccountPills accountId={acc.id} setAccountId={setAccountId} />

        <div className="sv-total">
          <span className="mono muted" data-reveal>
            Total saved
          </span>
          <CountUp key={acc.id} value={total} format={money} className="balance-xl" />
          <div className="sv-meta" data-reveal>
            <span className="pill-stat">
              <Icon name="spark" size={0.875} /> {rate}% weekly
            </span>
            <span className="pill-stat">≈ {money(Math.round((total * rate) / 100))} next payout</span>
            {acc.nextInterestAt && (
              <span className="pill-stat">
                <Icon name="clock" size={0.875} /> in {timeUntil(acc.nextInterestAt)}
              </span>
            )}
          </div>
        </div>

        <form className="sv-move" onSubmit={submit} data-reveal>
          <div className="seg seg-sm" role="tablist" aria-label="Direction">
            <button type="button" role="tab" aria-selected={dir === 'in'} onClick={() => setDir('in')}>
              Checking → Savings
            </button>
            <button type="button" role="tab" aria-selected={dir === 'out'} onClick={() => setDir('out')}>
              Savings → Checking
            </button>
          </div>
          <div className="sv-move-row">
            <AmountField amount={amount} setAmount={setAmount} invalid={over} autoFocus={false} />
            <button className="btn btn-primary" disabled={!amount || over || busy || !allowed} aria-busy={busy}>
              {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name={dir === 'in' ? 'in' : 'out'} />} Move
            </button>
          </div>
          <span className="mono muted">
            Available {money(max)} · unallocated savings {money(acc.savings)}
          </span>
          <ErrorLine error={!allowed ? "You don't have access to move this account's money" : over ? `Only ${money(max)} available` : error} />
        </form>

        <div className="sv-history" data-reveal>
          <div className="section-head">
            <span className="mono muted">Interest earned</span>
            <span className="mono muted">{money(acc.interestHistory.reduce((s, h) => s + h.amount, 0))} all time</span>
          </div>
          {history.length ? (
            <div className="bars" role="img" aria-label={`Weekly interest: ${history.map((h) => money(h.amount)).join(', ')}`}>
              {history.map((h, i) => (
                <div key={h.date} className="bar" style={{ ['--h' as string]: h.amount / peak, ['--d' as string]: `${i * 60}ms` }}>
                  <span className="bar-val mono">{money(h.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-note">Interest shows up here after your first weekly payout.</p>
          )}
        </div>
      </div>

      <aside className="sv-goals">
        <div className="section-head" data-reveal>
          <span className="mono muted">Goals · {money(inGoals)}</span>
          <button className="link mono" onClick={() => setNewGoal(true)} disabled={!acc.perms.deposit}>
            + New goal
          </button>
        </div>
        {acc.goals.length ? (
          <ul className="goal-list">
            {acc.goals.map((g) => {
              const pct = Math.min(100, Math.round((g.saved / g.target) * 100));
              return (
                <li key={g.id} className="goal" data-reveal>
                  <div className="goal-top">
                    <span className="goal-name">
                      <Icon name="target" size={1} /> {g.name}
                    </span>
                    <span className={`mono ${pct >= 100 ? 'is-done' : 'muted'}`}>{pct >= 100 ? 'Reached' : `${pct}%`}</span>
                  </div>
                  <Progress value={g.saved} max={g.target} label={`${g.name} progress`} />
                  <div className="goal-bottom">
                    <span className="num">
                      {money(g.saved)} <span className="muted">of {money(g.target)}</span>
                    </span>
                    <span className="goal-actions">
                      <button className="icon-btn" aria-label={`Add to ${g.name}`} onClick={() => setMoving({ goal: g, dir: 'in' })} disabled={!acc.perms.deposit}>
                        <Icon name="plus" size={1} />
                      </button>
                      <button className="icon-btn" aria-label={`Take from ${g.name}`} onClick={() => setMoving({ goal: g, dir: 'out' })} disabled={!acc.perms.withdraw || !g.saved}>
                        <Icon name="minus" size={1} />
                      </button>
                      <button className="icon-btn" aria-label={`Delete ${g.name}`} onClick={() => run('goalDelete', { goalId: g.id })} disabled={busy || !acc.perms.withdraw}>
                        <Icon name="trash" size={1} />
                      </button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="empty-state" data-reveal>
            <Icon name="target" size={1.75} />
            <p>Set a goal for that car, house or rainy day.</p>
          </div>
        )}
      </aside>

      {newGoal && <GoalDialog accountId={acc.id} onClose={() => setNewGoal(false)} />}
      {moving && <GoalMoveDialog goal={moving.goal} dir={moving.dir} checking={acc.balance} onClose={() => setMoving(null)} />}
    </div>
  );
}

function GoalDialog({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const { busy, error, run } = useAction();
  const [name, setName] = useState('');
  const [target, setTarget] = useState(0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run('goalCreate', { accountId, name: name.trim(), target }, 'chime');
    if (r.ok) onClose();
  };

  return (
    <Dialog title="New savings goal" onClose={onClose}>
      <form className="dialog-form" onSubmit={submit}>
        <label className="field">
          <span className="mono muted">What are you saving for?</span>
          <input autoFocus className="input" maxLength={32} placeholder="e.g. Vinewood Hills house" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <span className="mono muted">Target</span>
        <AmountField amount={target} setAmount={setTarget} label="Target" autoFocus={false} />
        <ErrorLine error={error} />
        <SubmitButton busy={busy} disabled={!name.trim() || !target} icon="target">
          Create goal
        </SubmitButton>
      </form>
    </Dialog>
  );
}

function GoalMoveDialog({ goal, dir, checking, onClose }: { goal: Goal; dir: 'in' | 'out'; checking: number; onClose: () => void }) {
  const { money } = useBank();
  const { busy, error, run } = useAction();
  const [amount, setAmount] = useState(0);
  const max = dir === 'in' ? Math.min(checking, Math.max(goal.target - goal.saved, 0) || checking) : goal.saved;
  const over = amount > (dir === 'in' ? checking : goal.saved);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run('goalMove', { goalId: goal.id, amount, direction: dir }, 'chime');
    if (r.ok) onClose();
  };

  return (
    <Dialog title={dir === 'in' ? `Add to ${goal.name}` : `Take from ${goal.name}`} onClose={onClose}>
      <form className="dialog-form" onSubmit={submit}>
        <AmountField amount={amount} setAmount={setAmount} invalid={over} />
        <div className="chips">
          <button type="button" className="chip" aria-pressed={amount === max} onClick={() => setAmount(max)}>
            {dir === 'in' ? 'Finish goal' : 'All'} · {money(max)}
          </button>
        </div>
        <span className="mono muted">
          {dir === 'in' ? `From checking · ${money(checking)} available` : `Back to checking · ${money(goal.saved)} in goal`}
        </span>
        <ErrorLine error={over ? 'More than is available' : error} />
        <SubmitButton busy={busy} disabled={!amount || over} icon={dir === 'in' ? 'in' : 'out'}>
          {dir === 'in' ? 'Add' : 'Take'} {amount ? money(amount) : ''}
        </SubmitButton>
      </form>
    </Dialog>
  );
}
