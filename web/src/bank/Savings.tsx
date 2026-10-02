import { useState, type FormEvent } from 'react';
import type { Goal } from '../nui';
import { useBank } from '../store';
import { CountUp, Icon } from '../fx';
import { timeUntil } from '../logic';
import { AmountField, Dialog, ErrorLine, Progress, SubmitButton, useAction } from '../ui';
import { AccountPills } from './Overview';
import type { SectionProps } from './Bank';

export function Savings({ accountId, setAccountId }: SectionProps) {
  const { data, cfg, money, t } = useBank();
  const { busy, error, run } = useAction();
  const [dir, setDir] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState(0);
  const [newGoal, setNewGoal] = useState(false);
  const [moving, setMoving] = useState<{ goal: Goal; dir: 'in' | 'out' } | null>(null);
  const acc = data.accounts.find((a) => a.id === accountId) ?? data.accounts[0];
  if (!acc) return <div className="panel empty">{t('no_accounts')}</div>;

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
            {t('total_saved')}
          </span>
          <CountUp key={acc.id} value={total} format={money} className="balance-xl" />
          <div className="sv-meta" data-reveal>
            <span className="pill-stat">
              <Icon name="spark" size={0.875} /> {t('rate_weekly', { rate })}
            </span>
            <span className="pill-stat">{t('next_payout', { amount: money(Math.round((total * rate) / 100)) })}</span>
            {acc.nextInterestAt && (
              <span className="pill-stat">
                <Icon name="clock" size={0.875} /> {t('in_time', { time: timeUntil(acc.nextInterestAt) })}
              </span>
            )}
          </div>
        </div>

        <form className="sv-move" onSubmit={submit} data-reveal>
          <div className="seg seg-sm" role="tablist" aria-label={t('direction')}>
            <button type="button" role="tab" aria-selected={dir === 'in'} onClick={() => setDir('in')}>
              {t('checking_to_savings')}
            </button>
            <button type="button" role="tab" aria-selected={dir === 'out'} onClick={() => setDir('out')}>
              {t('savings_to_checking')}
            </button>
          </div>
          <div className="sv-move-row">
            <AmountField amount={amount} setAmount={setAmount} invalid={over} autoFocus={false} />
            <button className="btn btn-primary" disabled={!amount || over || busy || !allowed} aria-busy={busy}>
              {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name={dir === 'in' ? 'in' : 'out'} />} {t('move')}
            </button>
          </div>
          <span className="mono muted">
            {t('available_unallocated', { amount: money(max), savings: money(acc.savings) })}
          </span>
          <ErrorLine error={!allowed ? t('err_no_move_access') : over ? t('err_only_available', { amount: money(max) }) : error} />
        </form>

        <div className="sv-history" data-reveal>
          <div className="section-head">
            <span className="mono muted">{t('interest_earned')}</span>
            <span className="mono muted">{t('all_time', { amount: money(acc.interestHistory.reduce((s, h) => s + h.amount, 0)) })}</span>
          </div>
          {history.length ? (
            <div className="bars" role="img" aria-label={t('weekly_interest_aria', { list: history.map((h) => money(h.amount)).join(', ') })}>
              {history.map((h, i) => (
                <div key={h.date} className="bar" style={{ ['--h' as string]: h.amount / peak, ['--d' as string]: `${i * 60}ms` }}>
                  <span className="bar-val mono">{money(h.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-note">{t('interest_empty')}</p>
          )}
        </div>
      </div>

      <aside className="sv-goals">
        <div className="section-head" data-reveal>
          <span className="mono muted">{t('goals_total', { amount: money(inGoals) })}</span>
          <button className="link mono" onClick={() => setNewGoal(true)} disabled={!acc.perms.deposit}>
            {t('new_goal_link')}
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
                    <span className={`mono ${pct >= 100 ? 'is-done' : 'muted'}`}>{pct >= 100 ? t('reached') : `${pct}%`}</span>
                  </div>
                  <Progress value={g.saved} max={g.target} label={t('goal_progress', { name: g.name })} />
                  <div className="goal-bottom">
                    <span className="num">
                      {money(g.saved)} <span className="muted">{t('of_amount', { amount: money(g.target) })}</span>
                    </span>
                    <span className="goal-actions">
                      <button className="icon-btn" aria-label={t('add_to', { name: g.name })} onClick={() => setMoving({ goal: g, dir: 'in' })} disabled={!acc.perms.deposit}>
                        <Icon name="plus" size={1} />
                      </button>
                      <button className="icon-btn" aria-label={t('take_from', { name: g.name })} onClick={() => setMoving({ goal: g, dir: 'out' })} disabled={!acc.perms.withdraw || !g.saved}>
                        <Icon name="minus" size={1} />
                      </button>
                      <button className="icon-btn" aria-label={t('delete_name', { name: g.name })} onClick={() => run('goalDelete', { goalId: g.id })} disabled={busy || !acc.perms.withdraw}>
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
            <p>{t('goals_empty')}</p>
          </div>
        )}
      </aside>

      {newGoal && <GoalDialog accountId={acc.id} onClose={() => setNewGoal(false)} />}
      {moving && <GoalMoveDialog goal={moving.goal} dir={moving.dir} checking={acc.balance} onClose={() => setMoving(null)} />}
    </div>
  );
}

function GoalDialog({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const { t } = useBank();
  const { busy, error, run } = useAction();
  const [name, setName] = useState('');
  const [target, setTarget] = useState(0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run('goalCreate', { accountId, name: name.trim(), target }, 'chime');
    if (r.ok) onClose();
  };

  return (
    <Dialog title={t('new_goal_title')} onClose={onClose}>
      <form className="dialog-form" onSubmit={submit}>
        <label className="field">
          <span className="mono muted">{t('goal_name_label')}</span>
          <input autoFocus className="input" maxLength={32} placeholder={t('goal_name_placeholder')} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <span className="mono muted">{t('target')}</span>
        <AmountField amount={target} setAmount={setTarget} label={t('target')} autoFocus={false} />
        <ErrorLine error={error} />
        <SubmitButton busy={busy} disabled={!name.trim() || !target} icon="target">
          {t('create_goal')}
        </SubmitButton>
      </form>
    </Dialog>
  );
}

function GoalMoveDialog({ goal, dir, checking, onClose }: { goal: Goal; dir: 'in' | 'out'; checking: number; onClose: () => void }) {
  const { money, t } = useBank();
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
    <Dialog title={t(dir === 'in' ? 'add_to' : 'take_from', { name: goal.name })} onClose={onClose}>
      <form className="dialog-form" onSubmit={submit}>
        <AmountField amount={amount} setAmount={setAmount} invalid={over} />
        <div className="chips">
          <button type="button" className="chip" aria-pressed={amount === max} onClick={() => setAmount(max)}>
            {t(dir === 'in' ? 'finish_goal' : 'all')} · {money(max)}
          </button>
        </div>
        <span className="mono muted">
          {dir === 'in' ? t('from_checking', { amount: money(checking) }) : t('back_to_checking', { amount: money(goal.saved) })}
        </span>
        <ErrorLine error={over ? t('err_more_than_available') : error} />
        <SubmitButton busy={busy} disabled={!amount || over} icon={dir === 'in' ? 'in' : 'out'}>
          {t(dir === 'in' ? 'add' : 'take')} {amount ? money(amount) : ''}
        </SubmitButton>
      </form>
    </Dialog>
  );
}
