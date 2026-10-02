-- Locale loader shared by server and client. Strings live in locales/<code>.json:
--   "server": messages sent from Lua (notifications, errors)
--   "ui":     every string the NUI shows (passed to the UI with the bank data)
-- Missing keys fall back to English, then to the key itself.

local function load(code)
    local raw = LoadResourceFile(GetCurrentResourceName(), ('locales/%s.json'):format(code))
    return raw and json.decode(raw) or nil
end

local fallback = load('en') or {}
local active = (Config.locale ~= 'en' and load(Config.locale)) or fallback

Locale = {}

function Locale.reload(code)
    active = (code ~= 'en' and load(code)) or fallback
end

--- Server/client message with %s placeholders filled in order.
function L(key, ...)
    local s = (active.server and active.server[key]) or (fallback.server and fallback.server[key]) or key
    if select('#', ...) > 0 then s = s:format(...) end
    return s
end

--- The UI string table: active language over English, key by key.
function Locale.ui()
    local out = {}
    for k, v in pairs(fallback.ui or {}) do out[k] = v end
    for k, v in pairs(active.ui or {}) do out[k] = v end
    return out
end

function Locale.intl()
    return (active.meta and active.meta.intl) or 'en-US'
end
