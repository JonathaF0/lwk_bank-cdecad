-- Business accounts: one per job, owned by the job's bosses.
-- On ESX the balance stays in esx_addonaccount's 'society_<job>' account so boss menus
-- and billing keep working; elsewhere it lives in lwk_bank_accounts.balance.

Business = {}

local function addonAccount(job)
    if Bridge.framework ~= 'esx' or GetResourceState('esx_addonaccount') ~= 'started' then return nil end
    local account
    TriggerEvent('esx_addonaccount:getSharedAccount', 'society_' .. job, function(a) account = a end)
    return account
end

function Business.ensure(job)
    if MySQL.scalar.await("SELECT 1 FROM lwk_bank_accounts WHERE type = 'business' AND owner = ?", { job.name }) then return end
    MySQL.insert.await(
        "INSERT INTO lwk_bank_accounts (iban, type, name, owner, created_at) VALUES (?, 'business', ?, ?, ?)",
        { Accounts.newIban(), job.label or job.name, job.name, Logic.now() })
end

function Business.byJob(jobName)
    return MySQL.single.await("SELECT * FROM lwk_bank_accounts WHERE type = 'business' AND owner = ?", { jobName })
end

function Business.balance(row)
    local a = addonAccount(row.owner)
    if a then return a.money end
    return row.balance
end

function Business.add(row, amount)
    local a = addonAccount(row.owner)
    if a then a.addMoney(amount) return true end
    return MySQL.update.await('UPDATE lwk_bank_accounts SET balance = balance + ? WHERE id = ?', { amount, row.id }) > 0
end

-- Exports for job scripts (boss menus, billing, shops):
--   exports.lwk_bank:AddBusinessMoney('police', 500, 'Fine paid')       -> boolean
--   exports.lwk_bank:RemoveBusinessMoney('police', 500, 'Equipment')    -> boolean
--   exports.lwk_bank:GetBusinessBalance('police')                       -> number
local function jobAccount(job)
    if type(job) ~= 'string' or job == '' then return nil end
    local row = Business.byJob(job)
    if not row then
        Business.ensure({ name = job, label = job })
        row = Business.byJob(job)
    end
    return row
end

function Business.addToJob(job, amount, reason)
    local row, amt = jobAccount(job), Logic.amount(amount)
    if not row or not amt or not Business.add(row, amt) then return false end
    Accounts.log(row.id, 'deposit', amt, Logic.text(reason, 1, 64) or L('tx_deposit'))
    return true
end
exports('AddBusinessMoney', Business.addToJob)

exports('RemoveBusinessMoney', function(job, amount, reason)
    local row, amt = jobAccount(job), Logic.amount(amount)
    if not row or not amt or not Business.remove(row, amt) then return false end
    Accounts.log(row.id, 'withdraw', amt, Logic.text(reason, 1, 64) or L('tx_withdraw'))
    return true
end)

exports('GetBusinessBalance', function(job)
    local row = jobAccount(job)
    return row and Business.balance(row) or 0
end)

function Business.remove(row, amount)
    local a = addonAccount(row.owner)
    if a then
        if a.money < amount then return false end
        a.removeMoney(amount)
        return true
    end
    return MySQL.update.await('UPDATE lwk_bank_accounts SET balance = balance - ? WHERE id = ? AND balance >= ?',
        { amount, row.id, amount }) > 0
end
