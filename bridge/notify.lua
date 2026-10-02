-- Notifications (client + server) through whichever resource the server uses.
-- Config.notify: 'auto' | 'ox' | 'okok' | 'wasabi' | 'esx' | 'qb'
-- 'auto' picks okokNotify or wasabi_notify when started, otherwise ox_lib.
-- Kinds used by this resource: 'inform' | 'success' | 'warning' | 'error'.

local SERVER = IsDuplicityVersion()
local kind

local function provider()
    if kind then return kind end
    local c = Config.notify or 'auto'
    if c ~= 'auto' then
        kind = c
    elseif GetResourceState('okokNotify') == 'started' then
        kind = 'okok'
    elseif GetResourceState('wasabi_notify') == 'started' then
        kind = 'wasabi'
    else
        kind = 'ox'
    end
    return kind
end

local function title()
    if SERVER then return Cfg().bankName end
    return (GlobalState.lwk_bank_world or Config).bankName
end

-- Each provider's event + arguments. Every one of these events is registered on the
-- client by its resource, so the server sends it and the client triggers it locally.
local function event(message, notifyType)
    local p, t = provider(), notifyType or 'inform'
    if p == 'okok' then
        return 'okokNotify:Alert', { title(), message, 5000, t == 'inform' and 'info' or t, false }
    elseif p == 'wasabi' then
        return 'wasabi_notify:notify', { title(), message, 5000, t == 'inform' and 'info' or t }
    elseif p == 'esx' then
        return 'esx:showNotification', { message, (t == 'inform' or t == 'warning') and 'info' or t, 5000 }
    elseif p == 'qb' then
        -- qbx_core understands ox_lib's types; classic qb-core only has primary/success/error.
        local qbx = GetResourceState('qbx_core') == 'started'
        local qt = qbx and t or (t == 'success' and 'success' or t == 'error' and 'error' or 'primary')
        return 'QBCore:Notify', { message, qt, 5000 }
    end
    return 'ox_lib:notify', { { title = title(), description = message, type = t } }
end

--- Server: Notify(src, message, type). Client: Notify(message, type).
function Notify(...)
    if SERVER then
        local src, message, notifyType = ...
        local name, args = event(message, notifyType)
        TriggerClientEvent(name, src, table.unpack(args))
    else
        local message, notifyType = ...
        local name, args = event(message, notifyType)
        TriggerEvent(name, table.unpack(args))
    end
end
