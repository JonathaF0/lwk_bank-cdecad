-- Pure helpers: no natives, no database. Unit-tested by tests/logic.test.mjs.

Logic = {}

function Logic.now()
    return os.time() * 1000
end

--- Whole, positive, sane amount or nil.
function Logic.amount(v, max)
    v = tonumber(v)
    if not v or v ~= v or v <= 0 or v % 1 ~= 0 or v > (max or 1e12) then return nil end
    return math.floor(v)
end

--- Trimmed string within length limits, or nil.
function Logic.text(v, minLen, maxLen)
    if type(v) ~= 'string' then return nil end
    v = v:gsub('^%s+', ''):gsub('%s+$', '')
    if #v < (minLen or 1) or #v > (maxLen or 48) then return nil end
    return v
end

function Logic.iban(v)
    if type(v) ~= 'string' then return nil end
    v = v:upper()
    return v:match('^[A-Z0-9]+$') and #v >= 4 and #v <= 12 and v or nil
end

function Logic.randomIban(prefix)
    return ('%s%06d'):format(prefix, math.random(0, 999999))
end

function Logic.randomDigits(n)
    local s = ''
    for _ = 1, n do s = s .. math.random(0, 9) end
    return s
end

local INCOMING = { deposit = true, transfer_in = true, paycheck = true, interest = true, loan = true }
function Logic.isIncoming(txType)
    return INCOMING[txType] == true
end

--- Closing balance for each of the last `days` days (oldest first), walked back
--- from today's balance using the transactions (newest first is fine, any order).
function Logic.history(balance, transactions, days, nowMs)
    days = days or 7
    local dayMs = 86400000
    local startOfToday = nowMs - (nowMs % dayMs)
    local net = {}
    for _, tx in ipairs(transactions) do
        if (tx.pot or 'checking') == 'checking' then
            local back = math.floor((startOfToday - (tx.date - (tx.date % dayMs))) / dayMs)
            if back >= 0 and back < days then
                net[back] = (net[back] or 0) + (Logic.isIncoming(tx.type) and tx.amount or -tx.amount)
            end
        end
    end
    local out, running = {}, balance
    for back = 0, days - 1 do
        out[days - back] = running
        running = running - (net[back] or 0)
    end
    return out
end

--- Simple interest over the term, equal daily instalments (mirrors web/src/logic.ts).
function Logic.quoteLoan(amount, planRate, termDays, adjust)
    local rate = math.max(0, planRate + adjust)
    local interest = math.floor(amount * rate / 100 + 0.5)
    local total = amount + interest
    return { rate = rate, interest = interest, total = total, daily = math.ceil(total / math.max(termDays, 1)) }
end

function Logic.creditBand(score, bands)
    local pick = bands[1]
    for _, b in ipairs(bands) do
        if score >= b.min then pick = b end
    end
    return pick
end

return Logic
