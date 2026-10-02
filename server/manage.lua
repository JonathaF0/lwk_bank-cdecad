-- Account management: open, rename, close, custom IBAN, and members on shared/business accounts.

Members = {}

local ALL = { deposit = true, withdraw = true, transfer = true, loans = true }
local DEFAULT_MEMBER = { deposit = true, withdraw = false, transfer = false, loans = false }
local ok, fail = Bank.ok, Bank.fail

function Members.list(row)
    local out = {}
    if row.type == 'business' then
        out[1] = { id = 'job:' .. row.owner, name = L('business_bosses', row.name), role = 'owner', perms = ALL }
    else
        out[1] = { id = row.owner, name = Bridge.offlineName(row.owner), role = 'owner', perms = ALL }
    end
    for _, m in ipairs(MySQL.query.await('SELECT * FROM lwk_bank_members WHERE account_id = ? ORDER BY name', { row.id })) do
        out[#out + 1] = { id = m.identifier, name = m.name, role = 'member', perms = Accounts.decodePerms(m.perms) }
    end
    return out
end

local function ownerOnly(src, identifier, accountId)
    local row, err = Accounts.open(src, identifier, accountId)
    if not row then return nil, err end
    if row.role ~= 'owner' then return nil, L('err_owner_only') end
    return row
end

local function ownedCount(identifier)
    return MySQL.scalar.await("SELECT COUNT(*) FROM lwk_bank_accounts WHERE owner = ? AND type <> 'business'", { identifier })
end

-- Accounts ---------------------------------------------------------------------------

Bank.action('accountCreate', function(src, identifier, p)
    local cfg = Cfg()
    if not cfg.features.accounts then return fail(L('err_disabled')) end
    local kind = p.type == 'shared' and 'shared' or 'personal'
    local name = Logic.text(p.name, 1, 28)
    if not name then return fail(L('err_name')) end
    if ownedCount(identifier) >= cfg.accounts.maxOwned then return fail(L('err_max_accounts', cfg.accounts.maxOwned)) end
    if kind == 'shared' and Accounts.sharedNameTaken(name) then return fail(L('err_name_taken')) end
    local fee = cfg.accounts.creationFee
    if fee > 0 and not Bridge.removeMoney(src, 'cash', fee, 'lwk_bank account fee') then return fail(L('err_fee_cash', fee)) end
    -- The unique index can still refuse a name taken a moment ago: give the fee back then.
    local okInsert, id = pcall(MySQL.insert.await, 'INSERT INTO lwk_bank_accounts (iban, type, name, owner, created_at) VALUES (?, ?, ?, ?, ?)',
        { Accounts.newIban(), kind, name, identifier, Logic.now() })
    if not okInsert or not id then
        if fee > 0 then Bridge.addMoney(src, 'cash', fee, 'lwk_bank account fee refund') end
        return fail(L('err_name_taken'))
    end
    Logs.event(src, 'admin', 'Account opened', ('%s (%s)'):format(name, kind))
    return ok(src)
end)

Bank.action('accountRename', function(src, identifier, p)
    local row, err = ownerOnly(src, identifier, p.accountId)
    if not row then return fail(err) end
    local name = Logic.text(p.name, 1, 28)
    if not name then return fail(L('err_name')) end
    if row.type == 'shared' and Accounts.sharedNameTaken(name, row.id) then return fail(L('err_name_taken')) end
    local okUpdate, changed = pcall(MySQL.update.await, 'UPDATE lwk_bank_accounts SET name = ? WHERE id = ?', { name, row.id })
    if not okUpdate or not changed then return fail(L('err_name_taken')) end
    return ok(src)
end)

Bank.action('accountDelete', function(src, identifier, p)
    local row, err = ownerOnly(src, identifier, p.accountId)
    if not row then return fail(err) end
    if Logic.flag(row.is_default) then return fail(L('err_delete_default')) end
    if row.type == 'business' then return fail(L('err_delete_business')) end
    local held = row.balance + row.savings + (Savings and Savings.goalTotal(row.id) or 0)
    if held > 0 then return fail(L('err_delete_not_empty')) end
    MySQL.update.await('DELETE FROM lwk_bank_members WHERE account_id = ?', { row.id })
    MySQL.update.await('DELETE FROM lwk_bank_accounts WHERE id = ?', { row.id })
    if Cards then Cards.deleteForAccount(row.id) end
    return ok(src)
end)

Bank.action('accountIban', function(src, identifier, p)
    local cfg = Cfg()
    if not cfg.features.customIban then return fail(L('err_disabled')) end
    local row, err = ownerOnly(src, identifier, p.accountId)
    if not row then return fail(err) end
    local iban = Logic.iban(p.iban)
    if not iban then return fail(L('err_iban_format')) end
    if Accounts.byIban(iban) then return fail(L('err_iban_taken')) end
    local fee = cfg.accounts.ibanFee
    if fee > 0 and not Accounts.debit(row, fee, src) then return fail(L('err_fee_account', fee)) end
    if fee > 0 then Accounts.log(row.id, 'fee', fee, L('tx_iban_fee')) end
    MySQL.update.await('UPDATE lwk_bank_accounts SET iban = ? WHERE id = ?', { iban, row.id })
    return ok(src)
end)

-- Members --------------------------------------------------------------------------------

Bank.action('memberAdd', function(src, identifier, p)
    local row, err = ownerOnly(src, identifier, p.accountId)
    if not row then return fail(err) end
    if row.type == 'personal' then return fail(L('err_personal_members')) end
    local target = tonumber(p.playerId)
    local targetId = target and Bridge.identifier(target)
    if not targetId then return fail(L('err_player_offline')) end
    if targetId == identifier then return fail(L('err_member_self')) end
    if MySQL.scalar.await('SELECT 1 FROM lwk_bank_members WHERE account_id = ? AND identifier = ?', { row.id, targetId }) then
        return fail(L('err_member_exists'))
    end
    if MySQL.scalar.await('SELECT COUNT(*) FROM lwk_bank_members WHERE account_id = ?', { row.id }) >= 25 then
        return fail(L('err_member_limit'))
    end
    MySQL.insert.await('INSERT INTO lwk_bank_members (account_id, identifier, name, perms) VALUES (?, ?, ?, ?)',
        { row.id, targetId, Bridge.name(target), json.encode(DEFAULT_MEMBER) })
    Bridge.notify(target, L('member_added', row.name), 'success')
    Bank.refresh(target)
    return ok(src)
end)

Bank.action('memberRemove', function(src, identifier, p)
    local memberId = tostring(p.memberId or '')
    local row, err
    if memberId == identifier then
        row, err = Accounts.open(src, identifier, p.accountId) -- members may leave on their own
    else
        row, err = ownerOnly(src, identifier, p.accountId)
    end
    if not row then return fail(err) end
    MySQL.update.await('DELETE FROM lwk_bank_members WHERE account_id = ? AND identifier = ?', { row.id, memberId })
    local gone = Bridge.sourceOf(memberId)
    if gone then Bank.refresh(gone) end
    return ok(src)
end)

Bank.action('memberPerms', function(src, identifier, p)
    local row, err = ownerOnly(src, identifier, p.accountId)
    if not row then return fail(err) end
    local perms = {}
    for k in pairs(DEFAULT_MEMBER) do perms[k] = type(p.perms) == 'table' and p.perms[k] == true end
    local changed = MySQL.update.await('UPDATE lwk_bank_members SET perms = ? WHERE account_id = ? AND identifier = ?',
        { json.encode(perms), row.id, tostring(p.memberId or '') })
    if changed == 0 then return fail(L('err_member_missing')) end
    local member = Bridge.sourceOf(tostring(p.memberId))
    if member then Bank.refresh(member) end
    return ok(src)
end)
