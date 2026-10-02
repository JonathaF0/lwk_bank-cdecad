-- Runtime configuration = config.lua defaults + overrides saved from the in-game editor.
-- Everything else reads config through Cfg().

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

Settings = { set = function(next) current = next end }
