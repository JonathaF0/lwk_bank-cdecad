-- Loans + credit score (300-850). Daily instalments are collected automatically every
-- hour once due: missed -> grace period -> late (fee added, score drops).

Loans = {}

local ok, fail = Bank.ok, Bank.fail
local DAY, HOUR = 86400000, 3600000
local MIN_SCORE, MAX_SCORE = 300, 850

CreateThread(function()
    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `lwk_bank_loans` (
        `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, `owner` VARCHAR(64) NOT NULL,
        `account_id` INT UNSIGNED NOT NULL, `plan_id` VARCHAR(32) NOT NULL,
        `principal` BIGINT NOT NULL, `remaining` BIGINT NOT NULL, `rate` DECIMAL(6,2) NOT NULL,
        `term_days` INT NOT NULL, `daily_payment` BIGINT NOT NULL, `next_due_at` BIGINT NOT NULL,
        `status` VARCHAR(16) NOT NULL DEFAULT 'active', `missed` INT NOT NULL DEFAULT 0, `created_at` BIGINT NOT NULL,
        PRIMARY KEY (`id`), KEY `owner` (`owner`), KEY `due` (`next_due_at`))]])
    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `lwk_bank_credit` (
        `identifier` VARCHAR(64) NOT NULL, `score` INT NOT NULL, PRIMARY KEY (`identifier`))]])
end)

function Loans.score(identifier)
    return MySQL.scalar.await('SELECT score FROM lwk_bank_credit WHERE identifier = ?', { identifier }) or Cfg().loans.startingScore
end

local function adjustScore(identifier, delta)
    local score = math.max(MIN_SCORE, math.min(MAX_SCORE, Loans.score(identifier) + delta))
    MySQL.insert.await('INSERT INTO lwk_bank_credit (identifier, score) VALUES (?, ?) ON DUPLICATE KEY UPDATE score = VALUES(score)',
        { identifier, score })
end
Loans.adjustScore = adjustScore

function Loans.forPlayer(identifier)
    if not Cfg().features.loans then return {} end
    local out = {}
    for _, l in ipairs(MySQL.query.await('SELECT * FROM lwk_bank_loans WHERE owner = ? ORDER BY id', { identifier })) do
        out[#out + 1] = {
            id = tostring(l.id), accountId = tostring(l.account_id), planId = l.plan_id, principal = l.principal,
            remaining = l.remaining, rate = tonumber(l.rate), termDays = l.term_days, dailyPayment = l.daily_payment,
            nextDueAt = l.next_due_at, status = l.status, createdAt = l.created_at,
        }
    end
    return out
end

local function planById(id)
    for _, p in ipairs(Cfg().loans.plans) do
        if p.id == id then return p end
    end
end

local function owedBy(identifier)
    return MySQL.scalar.await('SELECT COALESCE(SUM(remaining), 0) FROM lwk_bank_loans WHERE owner = ?', { identifier }) or 0
end

--- Borrowing limit: (checking + savings of the accounts the player owns) x multiplier, minus what's owed.
local function available(src, identifier)
    local total = 0
    for _, row in ipairs(Accounts.visible(src, identifier)) do
        if row.role == 'owner' then total = total + Accounts.balance(row, src) + row.savings end
    end
    return math.max(0, math.floor(total * Cfg().loans.balanceMultiplier) - owedBy(identifier))
end

Bank.action('loanApply', function(src, identifier, p)
    local cfg = Cfg().loans
    if not Cfg().features.loans then return fail(L('err_disabled')) end
    local row, err = Accounts.open(src, identifier, p.accountId)
    if not row then return fail(err) end
    if not row.perms.loans then return fail(L('err_perm_loans')) end
    if MySQL.scalar.await('SELECT COUNT(*) FROM lwk_bank_loans WHERE owner = ?', { identifier }) >= cfg.maxActive then
        return fail(L('err_loan_max', cfg.maxActive))
    end
    local plan = planById(p.planId)
    if not plan then return fail(L('err_loan_plan')) end
    local amount = Logic.amount(p.amount)
    if not amount or amount < plan.min or amount > plan.max then return fail(L('err_loan_range', plan.name, plan.min, plan.max)) end
    local term = tonumber(p.termDays)
    local validTerm = false
    for _, t in ipairs(cfg.terms) do if t == term then validTerm = true end end
    if not validTerm then return fail(L('err_loan_term')) end
    if amount > available(src, identifier) then return fail(L('err_loan_limit')) end

    local band = Logic.creditBand(Loans.score(identifier), cfg.bands)
    local q = Logic.quoteLoan(amount, plan.rate, term, band.adjust)
    if not Accounts.credit(row, amount) then return fail(L('err_generic')) end
    MySQL.insert.await([[INSERT INTO lwk_bank_loans (owner, account_id, plan_id, principal, remaining, rate, term_days,
        daily_payment, next_due_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)]],
        { identifier, row.id, plan.id, amount, q.total, q.rate, term, q.daily, Logic.now() + DAY, Logic.now() })
    Accounts.log(row.id, 'loan', amount, L('tx_loan', plan.name), Cfg().bankName)
    Logs.money(src, 'loan', amount, row, ('%s, %d days, %s%%'):format(plan.name, term, q.rate))
    return ok(src)
end)

local function closeIfPaid(loan, identifier)
    if loan.remaining > 0 then return end
    MySQL.update.await('DELETE FROM lwk_bank_loans WHERE id = ?', { loan.id })
    adjustScore(identifier, 12)
end

Bank.action('loanPay', function(src, identifier, p)
    local loan = MySQL.single.await('SELECT * FROM lwk_bank_loans WHERE id = ? AND owner = ?', { tonumber(p.loanId), identifier })
    if not loan then return fail(L('err_loan_missing')) end
    local amount = Logic.amount(p.amount)
    if not amount then return fail(L('err_amount')) end
    local row, err = Accounts.open(src, identifier, loan.account_id)
    if not row then return fail(err) end
    local pay = math.min(amount, loan.remaining)
    if not Accounts.debit(row, pay, src) then return fail(L('err_funds')) end
    loan.remaining = loan.remaining - pay
    -- A payment covering the instalment brings an overdue loan back on track.
    local covers = pay >= math.min(loan.daily_payment, loan.remaining + pay)
    local nextDue = (covers and loan.next_due_at - Logic.now() < DAY) and loan.next_due_at + DAY or loan.next_due_at
    MySQL.update.await('UPDATE lwk_bank_loans SET remaining = ?, next_due_at = ?, status = ? WHERE id = ?',
        { loan.remaining, nextDue, covers and 'active' or loan.status, loan.id })
    Accounts.log(row.id, 'transfer_out', pay, L('tx_loan_payment'), Cfg().bankName)
    closeIfPaid(loan, identifier)
    return ok(src)
end)

-- Scheduler: every hour, collect what's due.
local function collect()
    if not Cfg().features.loans then return end
    local cfg = Cfg().loans
    local now = Logic.now()
    for _, loan in ipairs(MySQL.query.await('SELECT * FROM lwk_bank_loans WHERE next_due_at <= ?', { now })) do
        local row = Accounts.byId(loan.account_id)
        local pay = math.min(loan.daily_payment, loan.remaining)
        local borrower = Bridge.sourceOf(loan.owner)
        local graceOver = now > loan.next_due_at + cfg.graceHours * HOUR

        if row and Accounts.debit(row, pay) then
            loan.remaining = loan.remaining - pay
            Accounts.log(row.id, 'transfer_out', pay, L('tx_loan_payment'), Cfg().bankName)
            MySQL.update.await("UPDATE lwk_bank_loans SET remaining = ?, next_due_at = next_due_at + ?, status = 'active' WHERE id = ?",
                { loan.remaining, DAY, loan.id })
            if loan.status == 'active' then adjustScore(loan.owner, 1) end
            closeIfPaid(loan, loan.owner)
        elseif loan.status == 'active' then
            MySQL.update.await("UPDATE lwk_bank_loans SET status = 'grace' WHERE id = ?", { loan.id })
            if borrower then Bridge.notify(borrower, L('loan_grace', cfg.graceHours), 'error') end
        elseif graceOver then
            local fee = math.ceil(pay * cfg.lateFee / 100)
            MySQL.update.await("UPDATE lwk_bank_loans SET status = 'late', remaining = remaining + ?, missed = missed + 1, next_due_at = next_due_at + ? WHERE id = ?",
                { fee, DAY, loan.id })
            adjustScore(loan.owner, -15)
            if borrower then Bridge.notify(borrower, L('loan_late', fee), 'error') end
        end
        if borrower then Bank.refresh(borrower) end
    end
end

lib.cron.new('0 * * * *', collect)
