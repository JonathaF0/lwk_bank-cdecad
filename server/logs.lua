-- Staff logs: Discord webhook and/or ox_lib's logger. Both optional (config.logs).

Logs = {}

local COLORS = { deposit = 5763719, withdraw = 15548997, transfer = 5793266, loan = 16705372, admin = 10181046, card = 3447003 }

local function send(event, title, fields, src)
    local cfg = Cfg().logs
    if cfg.oxLogger then
        local parts = {}
        for _, f in ipairs(fields) do parts[#parts + 1] = f.name .. ': ' .. f.value end
        lib.logger(src or 'lwk_bank', event, title .. ' | ' .. table.concat(parts, ' | '))
    end
    if cfg.webhook == '' then return end
    PerformHttpRequest(cfg.webhook, function() end, 'POST', json.encode({
        username = Cfg().bankName,
        embeds = { { title = title, color = COLORS[event] or 9807270, fields = fields,
            footer = { text = os.date('%Y-%m-%d %H:%M:%S') } } },
    }), { ['Content-Type'] = 'application/json' })
end

local function who(src)
    return ('%s (%s) [%s]'):format(Bridge.name(src), Bridge.identifier(src) or '?', src)
end

--- One money movement. Large amounts are flagged in the title.
function Logs.money(src, event, amount, account, detail)
    local big = amount >= Cfg().logs.bigAmount
    send(event, (big and '⚠ ' or '') .. event:upper() .. ' ' .. amount, {
        { name = 'Player', value = who(src) },
        { name = 'Account', value = ('%s · %s'):format(account.name, account.iban) },
        detail and { name = 'Detail', value = tostring(detail) } or nil,
    }, src)
end

function Logs.event(src, event, title, detail)
    send(event, title, {
        { name = 'Player', value = src and who(src) or 'console' },
        detail and { name = 'Detail', value = tostring(detail) } or nil,
    }, src)
end
