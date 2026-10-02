-- Drop-in replacement for other banks. Scripts written for Renewed-Banking, qb-banking,
-- qb-management or okokBanking keep calling their exports (exports['qb-banking']:AddMoney
-- ...) and LWK Bank answers them: fxmanifest `provide`s those names, and each export is
-- registered under the other resource's name below (the same trick Renewed-Banking uses
-- for qb-management). Society/job/gang accounts map to LWK business accounts; named
-- shared accounts map to LWK shared accounts. Player bank money stays framework money.

Compat = {}

local ALL_PERMS = json.encode({ deposit = true, withdraw = true, transfer = true, loans = true })

local function handle(resource, name, fn)
    AddEventHandler(('__cfx_export_%s_%s'):format(resource, name), function(setCB) setCB(fn) end)
end

local function strip(name)
    if type(name) ~= 'string' or name == '' then return nil end
    return (name:gsub('^society_', ''))
end

-- Whole currency units, like the rest of the bank.
local function units(v)
    v = tonumber(v)
    return v and Logic.amount(math.floor(v + 0.5)) or nil
end

--- Business account for a job/gang, made on first use like the original banks do.
--- force: also for names that aren't a framework job/gang (shops, custom societies).
function Compat.business(name, force)
    name = strip(name)
    if not name then return nil end
    local row = Business.byJob(name)
    if row then return row, false end
    local label = Bridge.groupLabel(name)
    if not label and not force then return nil end
    Business.ensure({ name = name, label = label or name })
    return Business.byJob(name), true
end

--- An account other scripts refer to by name: business first, then a shared account.
--- (Personal accounts are never addressed by name, like in the banks this replaces.)
--- create: make a business account for an unknown name; only when adding money, so a
--- typo'd name in another script can't leave empty accounts behind.
function Compat.named(name, create)
    local row = Compat.business(name, false)
    if row then return row end
    local n = strip(name)
    if not n then return nil end
    row = MySQL.single.await("SELECT * FROM lwk_bank_accounts WHERE type = 'shared' AND name = ? ORDER BY id LIMIT 1", { n })
    if row then return row end
    if create then return Compat.business(n, true) end
end

--- New shared account owned by `owner`, with members (identifiers) given full access.
--- A name already in use gets a number added ("Crew Fund 2").
function Compat.createShared(owner, name, balance, members)
    local id = MySQL.insert.await(
        "INSERT INTO lwk_bank_accounts (iban, type, name, owner, balance, created_at) VALUES (?, 'shared', ?, ?, ?, ?)",
        { Accounts.newIban(), Accounts.uniqueSharedName(Logic.text(name, 1, 48) or 'Shared'), owner, math.max(0, math.floor(tonumber(balance) or 0)), Logic.now() })
    for _, m in ipairs(members or {}) do
        if m ~= owner then Compat.addMember(Accounts.byId(id), m) end
    end
    return Accounts.byId(id)
end

function Compat.addMember(row, identifier)
    if not row or type(identifier) ~= 'string' then return false end
    MySQL.insert.await('INSERT IGNORE INTO lwk_bank_members (account_id, identifier, name, perms) VALUES (?, ?, ?, ?)',
        { row.id, identifier, Bridge.offlineName(identifier), ALL_PERMS })
    return true
end

local function add(row, amount, reason)
    local amt = units(amount)
    if not row or not amt or not Accounts.credit(row, amt) then return false end
    Accounts.log(row.id, 'deposit', amt, Logic.text(reason, 1, 64) or L('tx_deposit'))
    return true
end

local function remove(row, amount, reason)
    local amt = units(amount)
    if not row or not amt or not Accounts.debit(row, amt) then return false end
    Accounts.log(row.id, 'withdraw', amt, Logic.text(reason, 1, 64) or L('tx_withdraw'))
    return true
end

--- A player's default account when `id` is a player identifier (citizenid/license).
local function playerAccount(id)
    if type(id) ~= 'string' then return nil end
    local row = MySQL.single.await('SELECT * FROM lwk_bank_accounts WHERE owner = ? AND is_default = 1', { id })
    if row then return row end
    if Bridge.sourceOf(id) then return Accounts.ensureDefault(id) end
end

-- History-only exports (the caller moved the money itself). Business/shared accounts
-- already log every add/remove above, so only player accounts get an entry here.
local function record(id, amount, incoming, label, counterparty)
    local row, amt = playerAccount(id), units(amount)
    if not row or not amt then return end
    Accounts.log(row.id, incoming and 'deposit' or 'withdraw', amt, Logic.text(label, 1, 64) or L(incoming and 'tx_deposit' or 'tx_withdraw'),
        Logic.text(counterparty, 1, 64))
end

local function transactions(row, limit)
    if not row then return {} end
    return MySQL.query.await('SELECT * FROM lwk_bank_transactions WHERE account_id = ? ORDER BY id DESC LIMIT ?', { row.id, limit or 50 })
end

-- Renewed-Banking -----------------------------------------------------------------------
local function renewedAccount(row)
    if not row then return nil end
    local auth = {}
    for _, m in ipairs(MySQL.query.await('SELECT identifier FROM lwk_bank_members WHERE account_id = ?', { row.id })) do auth[m.identifier] = true end
    return { id = row.type == 'business' and row.owner or row.name, type = row.type == 'business' and 'job' or 'custom', name = row.name,
        frozen = false, amount = Accounts.balance(row), transactions = {}, auth = auth, creator = row.type ~= 'business' and row.owner or nil }
end

local renewed = {
    getAccountMoney = function(account)
        local row = Compat.named(account, false)
        return row and Accounts.balance(row) or false
    end,
    addAccountMoney = function(account, amount) return add(Compat.named(account, true), amount) end,
    removeAccountMoney = function(account, amount) return remove(Compat.named(account, false), amount) end,
    handleTransaction = function(account, title, amount, message, issuer, receiver, transType, transID)
        local incoming = transType == 'deposit'
        record(account, amount, incoming, (message and message ~= '') and message or title, incoming and issuer or receiver)
        return { trans_id = transID or tostring(Logic.now()), title = title, amount = amount, trans_type = transType,
            receiver = receiver, message = message, issuer = issuer, time = os.time() }
    end,
    GetJobAccount = function(job) return renewedAccount(Compat.business(job, false)) end,
    CreateJobAccount = function(job, initialBalance)
        if type(job) ~= 'table' then return nil end
        local row, created = Compat.business(job.name, true)
        if row and created and job.label then MySQL.update.await('UPDATE lwk_bank_accounts SET name = ? WHERE id = ?', { job.label, row.id }) end
        if row and created and units(initialBalance) then add(row, initialBalance) end
        return renewedAccount(row and Accounts.byId(row.id))
    end,
    addAccountMember = function(account, member) return Compat.addMember(Compat.named(account, false), member) end,
    removeAccountMember = function(account, member)
        local row = Compat.named(account, false)
        if not row then return false end
        MySQL.update.await('DELETE FROM lwk_bank_members WHERE account_id = ? AND identifier = ?', { row.id, member })
        return true
    end,
    getAccountTransactions = function(account)
        local out = {}
        for _, t in ipairs(transactions(Compat.named(account, false))) do
            out[#out + 1] = { trans_id = tostring(t.id), title = t.label, amount = t.amount, trans_type = Logic.isIncoming(t.type) and 'deposit' or 'withdraw',
                receiver = t.counterparty or '', message = t.label, issuer = t.counterparty or '', time = math.floor(t.created_at / 1000) }
        end
        return out
    end,
    changeAccountName = function(account, newName)
        local row, name = Compat.named(account, false), Logic.text(newName, 1, 48)
        if not row or not name then return false end
        if row.type == 'shared' and Accounts.sharedNameTaken(name, row.id) then return false end
        MySQL.update.await('UPDATE lwk_bank_accounts SET name = ? WHERE id = ?', { name, row.id })
        return true
    end,
}

-- qb-banking ----------------------------------------------------------------------------
local function qbAccount(row)
    if not row then return nil end
    local users = {}
    for _, m in ipairs(MySQL.query.await('SELECT identifier FROM lwk_bank_members WHERE account_id = ?', { row.id })) do users[#users + 1] = m.identifier end
    return { account_name = row.type == 'business' and row.owner or row.name, account_balance = Accounts.balance(row),
        account_type = row.type == 'business' and 'job' or 'shared', citizenid = row.type ~= 'business' and row.owner or nil, users = json.encode(users) }
end

local function createGroupAccount(name, balance)
    local row, created = Compat.business(name, true)
    if row and created and units(balance) then add(row, balance) end
    return row ~= nil
end

local qbBanking = {
    CreatePlayerAccount = function(playerId, accountName, accountBalance, accountUsers)
        local owner = Bridge.identifier(playerId)
        if not owner then return false end
        local users = type(accountUsers) == 'string' and json.decode(accountUsers) or accountUsers
        return Compat.createShared(owner, accountName, accountBalance, type(users) == 'table' and users or {}) ~= nil
    end,
    CreateJobAccount = createGroupAccount,
    CreateGangAccount = createGroupAccount,
    CreateBankStatement = function(playerId, account, amount, reason, statementType)
        local id = Bridge.identifier(playerId)
        if not Compat.named(account, false) and id then record(id, amount, statementType == 'deposit', reason) end
        return true
    end,
    AddMoney = function(name, amount, reason) return add(Compat.named(name, true), amount, reason) end,
    AddGangMoney = function(name, amount, reason) return add(Compat.named(name, true), amount, reason) end,
    RemoveMoney = function(name, amount, reason) return remove(Compat.named(name, false), amount, reason) end,
    RemoveGangMoney = function(name, amount, reason) return remove(Compat.named(name, false), amount, reason) end,
    GetAccount = function(name) return qbAccount(Compat.named(name, false)) end,
    GetGangAccount = function(name) return qbAccount(Compat.named(name, false)) end,
    GetAccountBalance = function(name)
        local row = Compat.named(name, false)
        return row and Accounts.balance(row) or 0
    end,
}

-- qb-management (before qb-banking took over society money) ------------------------------
local function balanceOf(name)
    local row = Compat.named(name, false)
    return row and Accounts.balance(row) or 0
end
local qbManagement = {
    GetAccount = balanceOf,
    GetGangAccount = balanceOf,
    AddMoney = function(name, amount) return add(Compat.named(name, true), amount) end,
    AddGangMoney = function(name, amount) return add(Compat.named(name, true), amount) end,
    RemoveMoney = function(name, amount) return remove(Compat.named(name, false), amount) end,
    RemoveGangMoney = function(name, amount) return remove(Compat.named(name, false), amount) end,
}

-- okokBanking ---------------------------------------------------------------------------
local okok = {
    GetAccount = balanceOf,
    AddMoney = function(society, value) return add(Compat.named(society, true), value) end,
    RemoveMoney = function(society, value) return remove(Compat.named(society, false), value) end,
    AddTransaction = function(id, data)
        if type(data) ~= 'table' then return false end
        local incoming = data.receiver_identifier == id
        record(id, data.value or data.amount, incoming, data.reason or data.type, incoming and data.sender_name or data.receiver_name)
        return true
    end,
    GetPlayerTransactions = function(id, limit)
        if limit and limit <= 0 then return {} end
        local out = {}
        for _, t in ipairs(transactions(playerAccount(id), limit or 100)) do
            local incoming = Logic.isIncoming(t.type)
            out[#out + 1] = { id = t.id, value = t.amount, type = t.type, date = os.date('%Y-%m-%d %H:%M:%S', math.floor(t.created_at / 1000)),
                receiver_identifier = incoming and id or '', receiver_name = incoming and '' or (t.counterparty or ''),
                sender_identifier = incoming and '' or id, sender_name = incoming and (t.counterparty or '') or '' }
        end
        return out
    end,
}

local PROVIDES = { ['Renewed-Banking'] = renewed, ['qb-banking'] = qbBanking, ['qb-management'] = qbManagement, okokBanking = okok }
for resource, fns in pairs(PROVIDES) do
    for name, fn in pairs(fns) do handle(resource, name, fn) end
end

-- Two banks answering the same exports would fight over every call. `provide` makes a
-- provided name report this resource's state and path, so only a different path is the
-- real (old) bank running.
CreateThread(function()
    local mine = GetResourcePath(GetCurrentResourceName())
    for i = 0, GetNumResources() - 1 do
        local res = GetResourceByFindIndex(i)
        if PROVIDES[res] and GetResourceState(res) == 'started' and GetResourcePath(res) ~= mine then
            print(('^1[lwk_bank] %s is also running. LWK Bank replaces it: remove or stop %s so they do not both answer its exports.^0'):format(res, res))
        end
    end
end)
