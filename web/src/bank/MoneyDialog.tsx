import { useState, type FormEvent } from 'react';
import type { Account } from '../nui';
import { useBank } from '../store';
import { Icon } from '../fx';
import { AmountField, Dialog, ErrorLine, QuickAmounts, SubmitButton, useAction } from '../ui';

const QUICK = [100, 500, 1_000, 5_000];

export function MoneyDialog({ kind, account, onClose }: { kind: 'deposit' | 'withdraw'; account: Account; onClose: () => void }) {
  const { data, money } = useBank();
  const { busy, error, run } = useAction();
  const [amount, setAmount] = useState(0);

  const max = kind === 'deposit' ? data.player.cash : account.balance;
  const over = amount > max;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!amount || over || busy) return;
    const r = await run(kind, { accountId: account.id, amount }, 'counter');
    if (r.ok) onClose();
  };

  return (
    <Dialog title={kind === 'deposit' ? 'Deposit cash' : 'Withdraw cash'} onClose={onClose}>
      <form onSubmit={submit} className="dialog-form">
        <div className="flow">
          <div>
            <span className="mono muted">{kind === 'deposit' ? 'From' : 'To'}</span>
            <strong>Cash on hand</strong>
            <span className="num muted">{money(data.player.cash)}</span>
          </div>
          <span className="flow-arrow" aria-hidden="true">
            <Icon name={kind === 'deposit' ? 'right' : 'left'} />
          </span>
          <div>
            <span className="mono muted">{kind === 'deposit' ? 'To' : 'From'}</span>
            <strong>{account.name}</strong>
            <span className="num muted">{money(account.balance)}</span>
          </div>
        </div>

        <AmountField amount={amount} setAmount={setAmount} invalid={over} />
        <QuickAmounts values={QUICK} amount={amount} setAmount={setAmount} max={max} />
        <ErrorLine error={over ? (kind === 'deposit' ? `You only have ${money(max)} cash` : `Exceeds balance by ${money(amount - max)}`) : error} />

        <SubmitButton busy={busy} disabled={!amount || over} icon={kind === 'deposit' ? 'in' : 'out'}>
          {kind === 'deposit' ? 'Deposit' : 'Withdraw'} {amount ? money(amount) : ''}
        </SubmitButton>
      </form>
    </Dialog>
  );
}
