-- Accounts: who can see what, and every movement of money in or out of an account.
-- The player's default personal account IS the framework bank balance; every other
-- account keeps its balance in lwk_bank_accounts.balance.

Accounts = {}

local ALL = { deposit = true, withdraw = true, transfer = true, loans = true }
local NONE = { deposit = false, withdraw = false, transfer = false, loans = false }

local function decodePerms(raw)
    local ok, t = pcall(json.decode, raw or '{}')
    local out = {}
    for k in pairs(NONE) do out[k] = ok and type(t) == 'table' and t[k] == true or false end
    return out
end
Accounts.decodePerms = decodePerms

function Accounts.newIban()
    local iban
    repeat
        iban = Logic.randomIban(Cfg().accounts.ibanPrefix)
    until not MySQL.scalar.await('SELECT 1 FROM lwk_bank_accounts WHERE iban = ?', { iban })
    return iban
end

function Accounts.byId(id)
    return MySQL.single.await('SELECT * FROM lwk_bank_accounts WHERE id = ?', { tonumber(id) })
end

function Accounts.byIban(iban)
    return MySQL.single.await('SELECT * FROM lwk_bank_accounts WHERE iban = ?', { iban })
end

function Accounts.ensureDefault(identifier)
    local row = MySQL.single.await('SELECT * FROM lwk_bank_accounts WHERE owner = ? AND is_default = 1', { identifier })
    if row then return row end
    MySQL.insert.await(
        'INSERT INTO lwk_bank_accounts (iban, type, name, owner, is_default, created_at) VALUES (?, ?, ?, ?, 1, ?)',
        { Accounts.newIban(), 'personal', L('default_account_name'), identifier, Logic.now() })
    return MySQL.single.await('SELECT * FROM lwk_bank_accounts WHERE owner = ? AND is_default = 1', { identifier })
end

--- Role and permissions `src` has on an account row, or nil for no access.
function Accounts.accessOf(src, identifier, row, memberPerms)
    if row.owner == identifier then return 'owner', ALL end
    if row.type == 'business' then
        local job = Bridge.getJob(src)
        if job and job.name == row.owner then
            if job.isBoss then return 'owner', ALL end
            return 'member', Cfg().business.employeePerms
        end
    end
    if memberPerms then return 'member', decodePerms(memberPerms) end
    return nil
end

--- Every account the player can open, each with role/perms attached.
function Accounts.visible(src, identifier)
    Accounts.ensureDefault(identifier)
    local job = Bridge.getJob(src)
    if job and job.isBoss and Cfg().features.business then Business.ensure(job) end
    local rows = MySQL.query.await([[
        SELECT a.*, m.perms AS member_perms
        FROM lwk_bank_accounts a
        LEFT JOIN lwk_bank_members m ON m.account_id = a.id AND m.identifier = ?
        WHERE a.owner = ? OR m.identifier IS NOT NULL OR (a.type = 'business' AND a.owner = ?)
        ORDER BY a.is_default DESC, a.id ASC]], { identifier, identifier, job and job.name or '' })
    local out = {}
    for _, row in ipairs(rows) do
        local role, perms = Accounts.accessOf(src, identifier, row, row.member_perms)
        if role then
            row.role, row.perms = role, perms
            out[#out + 1] = row
        end
    end
    return out
end

--- One account with access checked, or nil + error.
function Accounts.open(src, identifier, accountId)
    local row = Accounts.byId(accountId)
    if not row then return nil, L('err_account_missing') end
    local perms = row.owner ~= identifier
        and MySQL.scalar.await('SELECT perms FROM lwk_bank_members WHERE account_id = ? AND identifier = ?', { row.id, identifier })
        or nil
    local role, p = Accounts.accessOf(src, identifier, row, perms)
    if not role then return nil, L('err_no_access') end
    row.role, row.perms = role, p
    return row
end

function Accounts.balance(row, src)
    if row.is_default == 1 then
        local owner = src and Bridge.identifier(src) == row.owner and src or Bridge.sourceOf(row.owner)
        return owner and Bridge.getMoney(owner, 'bank') or 0
    end
    if row.type == 'business' then return Business.balance(row) end
    return row.balance
end

function Accounts.log(accountId, txType, amount, label, counterparty, pot)
    MySQL.insert.await(
        'INSERT INTO lwk_bank_transactions (account_id, type, amount, label, counterparty, pot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        { accountId, txType, amount, label, counterparty, pot, Logic.now() })
end

--- Take money out of an account's checking balance. Atomic: never overdraws.
function Accounts.debit(row, amount, src)
    if row.is_default == 1 then
        local owner = src and Bridge.identifier(src) == row.owner and src or Bridge.sourceOf(row.owner)
        return owner ~= nil and Bridge.removeMoney(owner, 'bank', amount, 'lwk_bank')
    end
    if row.type == 'business' then return Business.remove(row, amount) end
    return MySQL.update.await('UPDATE lwk_bank_accounts SET balance = balance - ? WHERE id = ? AND balance >= ?',
        { amount, row.id, amount }) > 0
end

--- Put money into an account's checking balance (owner may be offline).
function Accounts.credit(row, amount)
    if row.is_default == 1 then
        local owner = Bridge.sourceOf(row.owner)
        if owner then return Bridge.addMoney(owner, 'bank', amount, 'lwk_bank') end
        return Bridge.addBankOffline(row.owner, amount)
    end
    if row.type == 'business' then return Business.add(row, amount) end
    return MySQL.update.await('UPDATE lwk_bank_accounts SET balance = balance + ? WHERE id = ?', { amount, row.id }) > 0
end
