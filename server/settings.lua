-- Runtime configuration = config.lua defaults + overrides saved from the in-game editor
-- (/bankconfig). Everything else reads config through Cfg().

local current = Config

function Cfg()
    return current
end

--- The part of the config the UI needs (see web/src/nui.ts -> BankConfig).
function ConfigForUI()
    local c = Cfg()
    return {
        bankName = c.bankName, accent = c.accent, currency = c.currency, locale = Locale.intl(),
        features = c.features, sound = c.sound, cards = c.cards, savingsRates = c.savingsRates,
        loans = c.loans, accounts = c.accounts,
    }
end

--- What clients need to place banks/ATMs/blips; replicated so edits apply live.
local function publishWorld()
    local c = Cfg()
    GlobalState.lwk_bank_world = {
        bankName = c.bankName, locale = c.locale, banks = c.banks, atmModels = c.atmModels, blips = c.blips,
        interaction = c.interaction,
    }
end

-- Editor ----------------------------------------------------------------------------
-- Not editable in-game: framework/inventory/target/billing detection, debug, admin access
-- (a typo there could lock staff out) and interestDay (its cron is set at start).
local EDITABLE = {
    'locale', 'bankName', 'accent', 'currency', 'features', 'sound', 'cards', 'savingsRates', 'loans',
    'accounts', 'business', 'receipts', 'interaction', 'blips', 'atmModels', 'banks', 'logs',
}

--- The editable part of a config, in editor form (banks as plain numbers, not vector4).
local function editable(c)
    local out = {}
    for _, k in ipairs(EDITABLE) do out[k] = c[k] end
    out.banks = {}
    for i, b in ipairs(c.banks) do
        out.banks[i] = { label = b.label, x = b.coords.x, y = b.coords.y, z = b.coords.z, heading = b.coords.w }
    end
    return out
end

-- Template for sanitize: the defaults, plus a row shape so an empty bank list still validates.
local TEMPLATE = editable(Config)
TEMPLATE.banks = { { label = '', x = 0.0, y = 0.0, z = 0.0, heading = 0.0 } }

--- Validates editor values. Returns the clean values, or nil + the bad field's path.
local function validate(values)
    local clean, bad = Logic.sanitize(values, TEMPLATE)
    if not clean then return nil, bad end
    bad = Logic.checkConfig(clean)
    if bad then return nil, bad end
    if clean.locale ~= 'en' and not LoadResourceFile(GetCurrentResourceName(), ('locales/%s.json'):format(clean.locale)) then
        return nil, 'locale'
    end
    return clean
end

local function apply(values)
    local next = {}
    for k, v in pairs(Config) do next[k] = v end
    if values then
        for _, k in ipairs(EDITABLE) do next[k] = values[k] end
        next.banks = {}
        for i, b in ipairs(values.banks) do
            next.banks[i] = { label = b.label, coords = vec4(b.x, b.y, b.z, b.heading) }
        end
    end
    current = next
    Locale.reload(current.locale)
    publishWorld()
    TriggerEvent('lwk_bank:configChanged')
end

local function payload()
    local defaults = editable(Config)
    -- The editor needs a row shape to offer "Add bank" even when config.lua lists none.
    if #defaults.banks == 0 then defaults.banks = TEMPLATE.banks end
    return { values = editable(current), defaults = defaults, ui = Locale.ui(), accent = current.accent }
end

CreateThread(function()
    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `lwk_bank_settings` (
        `id` TINYINT UNSIGNED NOT NULL, `data` LONGTEXT NOT NULL, `updated_at` BIGINT NOT NULL,
        `updated_by` VARCHAR(64) NULL, PRIMARY KEY (`id`))]])
    local raw = MySQL.scalar.await('SELECT data FROM lwk_bank_settings WHERE id = 1')
    if not raw then return end
    local values, bad = validate(json.decode(raw) or {})
    if not values then
        return print(('^3[lwk_bank] Saved settings ignored, %s is invalid. Using config.lua.^0'):format(bad))
    end
    apply(values)
end)

lib.callback.register('lwk_bank:adminConfigSave', function(src, values)
    if not Bridge.isAdmin(src) then return { ok = false, error = L('err_no_permission') } end
    local clean, bad = validate(type(values) == 'table' and values or {})
    if not clean then return { ok = false, error = L('err_config_field', bad) } end
    MySQL.query.await('REPLACE INTO lwk_bank_settings (id, data, updated_at, updated_by) VALUES (1, ?, ?, ?)',
        { json.encode(clean), Logic.now(), Bridge.identifier(src) })
    apply(clean)
    Logs.event(src, 'config', 'Config saved', 'In-game editor')
    return { ok = true, data = payload() }
end)

lib.callback.register('lwk_bank:adminConfigReset', function(src)
    if not Bridge.isAdmin(src) then return { ok = false, error = L('err_no_permission') } end
    MySQL.query.await('DELETE FROM lwk_bank_settings WHERE id = 1')
    apply(nil)
    Logs.event(src, 'config', 'Config reset', 'Back to config.lua defaults')
    return { ok = true, data = payload() }
end)

lib.addCommand('bankconfig', { help = L('cmd_config_help') }, function(src)
    if src == 0 then return print('[lwk_bank] /bankconfig is in-game only.') end
    if not Bridge.isAdmin(src) then return Bridge.notify(src, L('err_no_permission'), 'error') end
    TriggerClientEvent('lwk_bank:openConfig', src, payload())
end)

publishWorld()
