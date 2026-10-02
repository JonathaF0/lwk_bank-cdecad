-- Framework bridge (server). Everything framework-specific lives here so the rest of
-- the resource only speaks: identifier, name, money (cash/bank), job, admin.
-- Detected once: qbx_core > qb-core > es_extended. Config.Framework can force one.

Bridge = Bridge or {}

local function present(res) return GetResourceState(res) ~= 'missing' end

local fw = Config.framework ~= 'auto' and Config.framework
    or (present('qbx_core') and 'qbox')
    or (present('qb-core') and 'qb')
    or (present('es_extended') and 'esx')
    or 'none'
Bridge.framework = fw

local QB, ESX
local function core()
    if fw == 'qb' and not QB then QB = exports['qb-core']:GetCoreObject() end
    if fw == 'esx' and not ESX then ESX = exports.es_extended:getSharedObject() end
end

local function player(src)
    core()
    if fw == 'qbox' then return exports.qbx_core:GetPlayer(src) end
    if fw == 'qb' then return QB.Functions.GetPlayer(src) end
    if fw == 'esx' then return ESX.GetPlayerFromId(src) end
end

-- 'cash' | 'bank' -> the framework's account name
local function moneyType(kind)
    if fw == 'esx' then return kind == 'cash' and 'money' or 'bank' end
    return kind
end

function Bridge.ready(src)
    return player(src) ~= nil
end

function Bridge.identifier(src)
    local p = player(src)
    if not p then return nil end
    if fw == 'esx' then return p.getIdentifier() end
    return p.PlayerData.citizenid
end

function Bridge.name(src)
    local p = player(src)
    if not p then return GetPlayerName(src) end
    if fw == 'esx' then return p.getName() end
    local c = p.PlayerData.charinfo or {}
    return (('%s %s'):format(c.firstname or '', c.lastname or ''):gsub('^%s+', ''):gsub('%s+$', ''))
end

function Bridge.getMoney(src, kind)
    local p = player(src)
    if not p then return 0 end
    if fw == 'esx' then
        local acc = p.getAccount(moneyType(kind))
        return acc and acc.money or 0
    end
    return p.Functions.GetMoney(kind) or 0
end

function Bridge.addMoney(src, kind, amount, reason)
    local p = player(src)
    if not p or amount <= 0 then return false end
    if fw == 'esx' then
        p.addAccountMoney(moneyType(kind), amount, reason)
        return true
    end
    return p.Functions.AddMoney(kind, amount, reason) ~= false
end

-- Checks the balance itself: never trust a framework to refuse an overdraft.
function Bridge.removeMoney(src, kind, amount, reason)
    local p = player(src)
    if not p or amount <= 0 or Bridge.getMoney(src, kind) < amount then return false end
    if fw == 'esx' then
        p.removeAccountMoney(moneyType(kind), amount, reason)
        return true
    end
    return p.Functions.RemoveMoney(kind, amount, reason) == true
end

function Bridge.sourceOf(identifier)
    core()
    if fw == 'qbox' then
        local p = exports.qbx_core:GetPlayerByCitizenId(identifier)
        return p and p.PlayerData.source
    end
    if fw == 'qb' then
        local p = QB.Functions.GetPlayerByCitizenId(identifier)
        return p and p.PlayerData.source
    end
    if fw == 'esx' then
        local p = ESX.GetPlayerFromIdentifier(identifier)
        return p and p.source
    end
end

-- Bank money for a player who isn't online: edit the stored JSON directly.
function Bridge.addBankOffline(identifier, amount)
    if fw == 'qb' or fw == 'qbox' then
        return MySQL.update.await(
            "UPDATE players SET money = JSON_SET(money, '$.bank', CAST(JSON_EXTRACT(money, '$.bank') AS SIGNED) + ?) WHERE citizenid = ?",
            { amount, identifier }) > 0
    end
    if fw == 'esx' then
        return MySQL.update.await(
            "UPDATE users SET accounts = JSON_SET(accounts, '$.bank', CAST(JSON_EXTRACT(accounts, '$.bank') AS SIGNED) + ?) WHERE identifier = ?",
            { amount, identifier }) > 0
    end
    return false
end

--- Offline debit, only if the stored balance covers it (atomic in the WHERE clause).
function Bridge.removeBankOffline(identifier, amount)
    if fw == 'qb' or fw == 'qbox' then
        return MySQL.update.await(
            "UPDATE players SET money = JSON_SET(money, '$.bank', CAST(JSON_EXTRACT(money, '$.bank') AS SIGNED) - ?) WHERE citizenid = ? AND CAST(JSON_EXTRACT(money, '$.bank') AS SIGNED) >= ?",
            { amount, identifier, amount }) > 0
    end
    if fw == 'esx' then
        return MySQL.update.await(
            "UPDATE users SET accounts = JSON_SET(accounts, '$.bank', CAST(JSON_EXTRACT(accounts, '$.bank') AS SIGNED) - ?) WHERE identifier = ? AND CAST(JSON_EXTRACT(accounts, '$.bank') AS SIGNED) >= ?",
            { amount, identifier, amount }) > 0
    end
    return false
end

-- Display name for an identifier that may be offline (for member lists, receipts).
function Bridge.offlineName(identifier)
    if fw == 'qb' or fw == 'qbox' then
        local info = MySQL.scalar.await('SELECT charinfo FROM players WHERE citizenid = ?', { identifier })
        local c = info and json.decode(info)
        return c and ('%s %s'):format(c.firstname, c.lastname) or identifier
    end
    if fw == 'esx' then
        local row = MySQL.single.await('SELECT firstname, lastname FROM users WHERE identifier = ?', { identifier })
        return row and ('%s %s'):format(row.firstname, row.lastname) or identifier
    end
    return identifier
end

function Bridge.getJob(src)
    local p = player(src)
    if not p then return nil end
    if fw == 'esx' then
        local j = p.getJob()
        return { name = j.name, label = j.label, grade = j.grade, isBoss = j.grade_name == 'boss' }
    end
    local j = p.PlayerData.job
    return { name = j.name, label = j.label, grade = j.grade and j.grade.level or 0, isBoss = j.isboss == true }
end

--- The player's gang (QBCore/Qbox only), or nil.
function Bridge.getGang(src)
    if fw ~= 'qb' and fw ~= 'qbox' then return nil end
    local p = player(src)
    local g = p and p.PlayerData.gang
    if not g or not g.name or g.name == 'none' then return nil end
    return { name = g.name, label = g.label, isBoss = g.isboss == true }
end

--- Label of a job or gang, or nil when the framework has no group by that name.
function Bridge.groupLabel(name)
    if type(name) ~= 'string' then return nil end
    core()
    local g
    if fw == 'qbox' then
        g = exports.qbx_core:GetJob(name) or exports.qbx_core:GetGang(name)
    elseif fw == 'qb' then
        g = QB.Shared.Jobs[name] or QB.Shared.Gangs[name]
    elseif fw == 'esx' then
        g = ESX.GetJobs()[name]
    end
    return g and g.label
end

function Bridge.isAdmin(src)
    if IsPlayerAceAllowed(src, Cfg().admin.ace) then return true end
    local p = player(src)
    if fw == 'esx' and p then
        local g = p.getGroup()
        for _, allowed in ipairs(Cfg().admin.esxGroups) do
            if g == allowed then return true end
        end
    end
    return false
end

function Bridge.notify(src, message, kind)
    Notify(src, message, kind)
end

if fw == 'none' then
    print('^1[lwk_bank] No supported framework found (qbx_core, qb-core, es_extended). The bank will not work.^0')
end
