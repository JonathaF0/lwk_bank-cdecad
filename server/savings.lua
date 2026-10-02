-- Savings: a savings pot per account, goals on top of it, and weekly interest on both.

Savings = {}

local ok, fail = Bank.ok, Bank.fail
local MAX_GOALS = 10

CreateThread(function()
    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `lwk_bank_goals` (
        `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, `account_id` INT UNSIGNED NOT NULL,
        `name` VARCHAR(32) NOT NULL, `target` BIGINT NOT NULL, `saved` BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY (`id`), KEY `account` (`account_id`))]])
    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `lwk_bank_interest` (
        `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, `account_id` INT UNSIGNED NOT NULL,
        `amount` BIGINT NOT NULL, `created_at` BIGINT NOT NULL,
        PRIMARY KEY (`id`), KEY `account` (`account_id`))]])
end)

--- Unix ms of the next interest payout (00:00 on config.interestDay; 1 = Sunday).
local function nextPayout()
    local t = os.date('*t')
    local days = (Cfg().interestDay - t.wday) % 7
    if days == 0 then days = 7 end
    return os.time({ year = t.year, month = t.month, day = t.day + days, hour = 0 }) * 1000
end

function Savings.goalTotal(accountId)
    return MySQL.scalar.await('SELECT COALESCE(SUM(saved), 0) FROM lwk_bank_goals WHERE account_id = ?', { accountId }) or 0
end

--- Adds goals / interest history / next payout to an account sent to the UI.
function Savings.attach(acc, row)
    if not Cfg().features.savings then return end
    for _, g in ipairs(MySQL.query.await('SELECT * FROM lwk_bank_goals WHERE account_id = ? ORDER BY id', { row.id })) do
        acc.goals[#acc.goals + 1] = { id = tostring(g.id), name = g.name, target = g.target, saved = g.saved }
    end
    local hist = MySQL.query.await('SELECT amount, created_at FROM lwk_bank_interest WHERE account_id = ? ORDER BY created_at DESC LIMIT 8', { row.id })
    for i = #hist, 1, -1 do
        acc.interestHistory[#acc.interestHistory + 1] = { date = hist[i].created_at, amount = hist[i].amount }
    end
    acc.nextInterestAt = nextPayout()
end

local function enabled() return Cfg().features.savings end

Bank.action('savingsMove', function(src, identifier, p)
    if not enabled() then return fail(L('err_disabled')) end
    local amount = Logic.amount(p.amount)
    if not amount then return fail(L('err_amount')) end
    local row, err = Accounts.open(src, identifier, p.accountId)
    if not row then return fail(err) end
    if p.direction == 'in' then
        if not row.perms.deposit then return fail(L('err_perm_deposit')) end
        if not Accounts.debit(row, amount, src) then return fail(L('err_funds')) end
        MySQL.update.await('UPDATE lwk_bank_accounts SET savings = savings + ? WHERE id = ?', { amount, row.id })
        Accounts.log(row.id, 'transfer_out', amount, L('tx_to_savings'), nil, 'savings')
    else
        if not row.perms.withdraw then return fail(L('err_perm_withdraw')) end
        if MySQL.update.await('UPDATE lwk_bank_accounts SET savings = savings - ? WHERE id = ? AND savings >= ?', { amount, row.id, amount }) == 0 then
            return fail(L('err_savings_funds'))
        end
        Accounts.credit(row, amount)
        Accounts.log(row.id, 'transfer_in', amount, L('tx_from_savings'), nil, 'savings')
    end
    return ok(src)
end)

Bank.action('goalCreate', function(src, identifier, p)
    if not enabled() then return fail(L('err_disabled')) end
    local row, err = Accounts.open(src, identifier, p.accountId)
    if not row then return fail(err) end
    if not row.perms.deposit then return fail(L('err_perm_deposit')) end
    local name, target = Logic.text(p.name, 1, 32), Logic.amount(p.target)
    if not name then return fail(L('err_name')) end
    if not target then return fail(L('err_amount')) end
    if MySQL.scalar.await('SELECT COUNT(*) FROM lwk_bank_goals WHERE account_id = ?', { row.id }) >= MAX_GOALS then
        return fail(L('err_goal_limit', MAX_GOALS))
    end
    MySQL.insert.await('INSERT INTO lwk_bank_goals (account_id, name, target) VALUES (?, ?, ?)', { row.id, name, target })
    return ok(src)
end)

local function goalWithAccount(src, identifier, goalId)
    local goal = MySQL.single.await('SELECT * FROM lwk_bank_goals WHERE id = ?', { tonumber(goalId) })
    if not goal then return nil, nil, L('err_goal_missing') end
    local row, err = Accounts.open(src, identifier, goal.account_id)
    return goal, row, err
end

Bank.action('goalMove', function(src, identifier, p)
    if not enabled() then return fail(L('err_disabled')) end
    local amount = Logic.amount(p.amount)
    if not amount then return fail(L('err_amount')) end
    local goal, row, err = goalWithAccount(src, identifier, p.goalId)
    if not row then return fail(err) end
    if p.direction == 'in' then
        if not row.perms.deposit then return fail(L('err_perm_deposit')) end
        if not Accounts.debit(row, amount, src) then return fail(L('err_funds')) end
        MySQL.update.await('UPDATE lwk_bank_goals SET saved = saved + ? WHERE id = ?', { amount, goal.id })
        Accounts.log(row.id, 'transfer_out', amount, L('tx_to_goal', goal.name), nil, 'savings')
    else
        if not row.perms.withdraw then return fail(L('err_perm_withdraw')) end
        if MySQL.update.await('UPDATE lwk_bank_goals SET saved = saved - ? WHERE id = ? AND saved >= ?', { amount, goal.id, amount }) == 0 then
            return fail(L('err_goal_funds'))
        end
        Accounts.credit(row, amount)
        Accounts.log(row.id, 'transfer_in', amount, L('tx_from_goal', goal.name), nil, 'savings')
    end
    return ok(src)
end)

Bank.action('goalDelete', function(src, identifier, p)
    local goal, row, err = goalWithAccount(src, identifier, p.goalId)
    if not row then return fail(err) end
    if not row.perms.withdraw then return fail(L('err_perm_withdraw')) end
    if MySQL.update.await('DELETE FROM lwk_bank_goals WHERE id = ?', { goal.id }) > 0 and goal.saved > 0 then
        Accounts.credit(row, goal.saved)
        Accounts.log(row.id, 'transfer_in', goal.saved, L('tx_from_goal', goal.name), nil, 'savings')
    end
    return ok(src)
end)

-- Weekly interest on savings + goals, paid into the savings pot.
local function payInterest()
    local cfg = Cfg()
    if not cfg.features.savings then return end
    local rows = MySQL.query.await([[
        SELECT a.id, a.type, a.savings + COALESCE(SUM(g.saved), 0) AS held
        FROM lwk_bank_accounts a LEFT JOIN lwk_bank_goals g ON g.account_id = a.id
        GROUP BY a.id HAVING held > 0]])
    local now = Logic.now()
    for _, r in ipairs(rows) do
        local amount = math.floor(r.held * (cfg.savingsRates[r.type] or 0) / 100)
        if amount > 0 then
            MySQL.update.await('UPDATE lwk_bank_accounts SET savings = savings + ? WHERE id = ?', { amount, r.id })
            MySQL.insert.await('INSERT INTO lwk_bank_interest (account_id, amount, created_at) VALUES (?, ?, ?)', { r.id, amount, now })
            Accounts.log(r.id, 'interest', amount, L('tx_interest'), nil, 'savings')
        end
    end
    print(('[lwk_bank] Weekly interest paid on %d accounts.'):format(#rows))
end

lib.cron.new(('0 0 * * %d'):format(Config.interestDay), payInterest)
