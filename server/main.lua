-- Entry point: schema, sessions, the BankData the UI renders, and the money callbacks.
-- Every NUI action arrives as lib.callback 'lwk_bank:<event>' and answers with a Result:
--   { ok = true, data = <fresh BankData> }  or  { ok = false, error = '<message>' }

Bank = {}

local RES = GetCurrentResourceName()

-- Schema ---------------------------------------------------------------------

CreateThread(function()
    local sql = LoadResourceFile(RES, 'sql/install.sql') or ''
    for statement in sql:gsub('%-%-[^\n]*', ''):gmatch('[^;]+') do
        if statement:find('%S') then MySQL.query.await(statement) end
    end
end)

-- Sessions + locks -------------------------------------------------------------
-- A session exists only while the UI is open; ATM sessions allow cash + PIN only.

local sessions, busy = {}, {}
local ATM_ALLOWED = { deposit = true, withdraw = true, verifyPin = true }

local function nearBank(src)
    local ped = GetPlayerPed(src)
    if ped == 0 then return false end
    local pos = GetEntityCoords(ped)
    for _, b in ipairs(Cfg().banks) do
        if #(pos - b.coords.xyz) < 15.0 then return true end
    end
    return false
end

function Bank.session(src) return sessions[src] end

AddEventHandler('playerDropped', function()
    sessions[source], busy[source] = nil, nil
end)

-- Settings saved in the editor: everyone with the UI open gets the new config straight away.
AddEventHandler('lwk_bank:configChanged', function()
    for src in pairs(sessions) do Bank.refresh(src) end
end)

local function ok(src) return { ok = true, data = Bank.build(src) } end
local function fail(message) return { ok = false, error = message } end
Bank.ok, Bank.fail = ok, fail

--- Registers a guarded UI action: player loaded, session open, one action at a time.
function Bank.action(name, fn)
    lib.callback.register('lwk_bank:' .. name, function(src, payload)
        local session = sessions[src]
        if not session then return fail(L('err_session')) end
        if session.mode == 'atm' and not ATM_ALLOWED[name] then return fail(L('err_atm_only')) end
        if busy[src] then return fail(L('err_busy')) end
        local identifier = Bridge.identifier(src)
        if not identifier then return fail(L('err_session')) end
        busy[src] = true
        local success, result = pcall(fn, src, identifier, type(payload) == 'table' and payload or {}, session)
        busy[src] = nil
        if not success then
            print(('^1[lwk_bank] %s failed: %s^0'):format(name, result))
            return fail(L('err_generic'))
        end
        return result
    end)
end

-- BankData -------------------------------------------------------------------------

local function placeholders(n) return ('?,'):rep(n):sub(1, -2) end

function Bank.build(src)
    local identifier = Bridge.identifier(src)
    local rows = Accounts.visible(src, identifier)
    local now = Logic.now()

    local ids = {}
    for i, row in ipairs(rows) do ids[i] = row.id end
    local txRows = #ids > 0 and MySQL.query.await(
        ('SELECT * FROM lwk_bank_transactions WHERE account_id IN (%s) ORDER BY created_at DESC LIMIT 400'):format(placeholders(#ids)),
        ids) or {}

    local transactions, byAccount = {}, {}
    for i, t in ipairs(txRows) do
        local tx = { id = tostring(t.id), accountId = tostring(t.account_id), type = t.type, amount = t.amount,
            label = t.label, counterparty = t.counterparty, pot = t.pot, date = t.created_at }
        transactions[i] = tx
        byAccount[t.account_id] = byAccount[t.account_id] or {}
        table.insert(byAccount[t.account_id], tx)
    end

    local accounts = {}
    for i, row in ipairs(rows) do
        local balance = Accounts.balance(row, src)
        local acc = {
            id = tostring(row.id), type = row.type, name = row.name, iban = row.iban,
            balance = balance, savings = row.savings, goals = {}, interestHistory = {},
            history = Logic.history(balance, byAccount[row.id] or {}, 7, now),
            openedAt = row.created_at, role = row.role, perms = row.perms, members = {},
        }
        if Savings then Savings.attach(acc, row) end
        if Members and row.type ~= 'personal' then acc.members = Members.list(row) end
        accounts[i] = acc
    end

    local contacts = {}
    for i, c in ipairs(MySQL.query.await('SELECT * FROM lwk_bank_contacts WHERE identifier = ? ORDER BY name', { identifier })) do
        contacts[i] = { id = tostring(c.id), name = c.name, iban = c.iban }
    end

    return {
        config = ConfigForUI(),
        ui = Locale.ui(),
        player = { name = Bridge.name(src), cash = Bridge.getMoney(src, 'cash') },
        accounts = accounts,
        transactions = transactions,
        contacts = contacts,
        cards = Cards and Cards.forPlayer(src, identifier) or {},
        loans = Loans and Loans.forPlayer(identifier) or {},
        creditScore = Loans and Loans.score(identifier) or Cfg().loans.startingScore,
        bills = Bills and Bills.forPlayer(src, identifier) or {},
    }
end

--- Push fresh data to a player whose UI is open (e.g. they just received money).
function Bank.refresh(src)
    if sessions[src] then TriggerClientEvent('lwk_bank:update', src, Bank.build(src)) end
end

-- Opening / closing ------------------------------------------------------------------

lib.callback.register('lwk_bank:open', function(src, mode)
    if not Bridge.identifier(src) then return nil end
    mode = mode == 'atm' and 'atm' or 'bank'
    if mode == 'bank' and not Cfg().debug and not nearBank(src) then return nil end
    sessions[src] = { mode = mode, openedAt = Logic.now() }
    return Bank.build(src)
end)

lib.callback.register('lwk_bank:close', function(src)
    sessions[src] = nil
    return {}
end)

-- Cash ---------------------------------------------------------------------------------

-- At an ATM (decided by the server's session, never the UI) cash only moves through the
-- card verified by PIN, within its daily limit.
local function atmGuard(src, session, row, amount, withdrawing)
    if session.mode ~= 'atm' then return true end
    if not Cards then return false, L('err_card_session') end
    return Cards.atmAllows(src, row, amount, withdrawing)
end

Bank.action('deposit', function(src, identifier, p, session)
    local amount = Logic.amount(p.amount)
    if not amount then return fail(L('err_amount')) end
    local row, err = Accounts.open(src, identifier, p.accountId)
    if not row then return fail(err) end
    if not row.perms.deposit then return fail(L('err_perm_deposit')) end
    local allowed, why = atmGuard(src, session, row, amount, false)
    if not allowed then return fail(why) end
    if not Bridge.removeMoney(src, 'cash', amount, 'lwk_bank') then return fail(L('err_cash')) end
    if not Accounts.credit(row, amount) then
        Bridge.addMoney(src, 'cash', amount, 'lwk_bank refund')
        return fail(L('err_generic'))
    end
    Accounts.log(row.id, 'deposit', amount, L(session.mode == 'atm' and 'tx_atm_deposit' or 'tx_deposit'), Bridge.name(src))
    Logs.money(src, 'deposit', amount, row)
    return ok(src)
end)

Bank.action('withdraw', function(src, identifier, p, session)
    local amount = Logic.amount(p.amount)
    if not amount then return fail(L('err_amount')) end
    local row, err = Accounts.open(src, identifier, p.accountId)
    if not row then return fail(err) end
    if not row.perms.withdraw then return fail(L('err_perm_withdraw')) end
    local allowed, why = atmGuard(src, session, row, amount, true)
    if not allowed then return fail(why) end
    if not Accounts.debit(row, amount, src) then return fail(L('err_funds')) end
    Bridge.addMoney(src, 'cash', amount, 'lwk_bank')
    if session.mode == 'atm' then Cards.recordSpend(src, amount) end
    Accounts.log(row.id, 'withdraw', amount, L(session.mode == 'atm' and 'tx_atm_withdraw' or 'tx_withdraw'), Bridge.name(src))
    Logs.money(src, 'withdraw', amount, row)
    return ok(src)
end)

-- Transfers -------------------------------------------------------------------------------

local function displayName(row)
    if row.is_default == 1 then return Bridge.offlineName(row.owner) end
    return row.name
end

Bank.action('transfer', function(src, identifier, p)
    local amount = Logic.amount(p.amount)
    if not amount then return fail(L('err_amount')) end
    local from, err = Accounts.open(src, identifier, p.accountId)
    if not from then return fail(err) end
    if not from.perms.transfer then return fail(L('err_perm_transfer')) end

    local ibans = type(p.ibans) == 'table' and p.ibans or {}
    local max = Cfg().features.multiTransfer and 10 or 1
    if #ibans < 1 or #ibans > max then return fail(L('err_recipients')) end

    local targets, seen = {}, {}
    for _, raw in ipairs(ibans) do
        local iban = Logic.iban(raw)
        if not iban or seen[iban] then return fail(L('err_iban', tostring(raw))) end
        seen[iban] = true
        local to = Accounts.byIban(iban)
        if not to then return fail(L('err_iban', iban)) end
        if to.id == from.id then return fail(L('err_same_account')) end
        targets[#targets + 1] = to
    end

    local total = amount * #targets
    if not Accounts.debit(from, total, src) then return fail(L('err_funds')) end

    local note = Logic.text(p.note, 1, 40)
    local sender = from.is_default == 1 and Bridge.name(src) or from.name
    for _, to in ipairs(targets) do
        if Accounts.credit(to, amount) then
            Accounts.log(from.id, 'transfer_out', amount, note or L('tx_transfer_out'), displayName(to))
            Accounts.log(to.id, 'transfer_in', amount, note or L('tx_transfer_in'), sender)
            local recipient = to.is_default == 1 and Bridge.sourceOf(to.owner)
            if recipient and recipient ~= src then
                TriggerClientEvent('lwk_bank:incoming', recipient, amount, sender)
                Bank.refresh(recipient)
            end
        else
            Accounts.credit(from, amount) -- refund this leg
        end
    end
    Logs.money(src, 'transfer', total, from, #targets > 1 and ('%d recipients'):format(#targets) or targets[1].iban)
    return ok(src)
end)

-- Contacts --------------------------------------------------------------------------------

Bank.action('contactSave', function(src, identifier, p)
    if not Cfg().features.contacts then return fail(L('err_disabled')) end
    local name, iban = Logic.text(p.name, 1, 24), Logic.iban(p.iban)
    if not name then return fail(L('err_name')) end
    if not iban or not Accounts.byIban(iban) then return fail(L('err_iban', tostring(p.iban))) end
    if MySQL.scalar.await('SELECT 1 FROM lwk_bank_contacts WHERE identifier = ? AND iban = ?', { identifier, iban }) then
        return fail(L('err_contact_exists'))
    end
    if MySQL.scalar.await('SELECT COUNT(*) FROM lwk_bank_contacts WHERE identifier = ?', { identifier }) >= 50 then
        return fail(L('err_contact_limit'))
    end
    MySQL.insert.await('INSERT INTO lwk_bank_contacts (identifier, name, iban) VALUES (?, ?, ?)', { identifier, name, iban })
    return ok(src)
end)

Bank.action('contactDelete', function(src, identifier, p)
    MySQL.update.await('DELETE FROM lwk_bank_contacts WHERE id = ? AND identifier = ?', { tonumber(p.contactId), identifier })
    return ok(src)
end)
