-- Specs for server/logic.lua. run.mjs runs these with the repo root as cwd.
assert(loadfile('server/logic.lua'))()

local eq = function(a, b, msg) assert(a == b, (msg or '') .. ' expected ' .. tostring(b) .. ' got ' .. tostring(a)) end

-- amounts ------------------------------------------------------------------------
eq(Logic.amount(500), 500)
eq(Logic.amount('250'), 250, 'numeric string')
eq(Logic.amount(0), nil, 'zero')
eq(Logic.amount(-5), nil, 'negative')
eq(Logic.amount(1.5), nil, 'fraction')
eq(Logic.amount(0 / 0), nil, 'NaN')
eq(Logic.amount(1e13), nil, 'too big')
eq(Logic.amount('abc'), nil, 'junk')

-- text / iban ----------------------------------------------------------------------
eq(Logic.text('  Rainy day  ', 1, 20), 'Rainy day')
eq(Logic.text('', 1, 20), nil)
eq(Logic.text(('x'):rep(30), 1, 20), nil)
eq(Logic.text(42), nil)
eq(Logic.iban('lw204118'), 'LW204118')
eq(Logic.iban('LW-1'), nil)
eq(Logic.iban('ABC'), nil)
eq(#Logic.randomIban('LW'), 8)

-- history: balance walked back through the last 7 days ------------------------------
local day = 86400000
local now = 20 * day + 5000
local h = Logic.history(1000, {
    { type = 'deposit', amount = 300, date = now - 1000 },             -- today
    { type = 'withdraw', amount = 100, date = now - day },              -- yesterday
    { type = 'deposit', amount = 50, date = now - 2 * day, pot = 'savings' }, -- savings: ignored
}, 7, now)
eq(#h, 7)
eq(h[7], 1000, 'today closes at the balance')
eq(h[6], 700, 'before today\'s +300')
eq(h[5], 800, 'before yesterday\'s -100')
eq(h[1], 800, 'flat before that')

-- loans ------------------------------------------------------------------------------
local q = Logic.quoteLoan(10000, 10, 24, -3)
eq(q.rate, 7); eq(q.interest, 700); eq(q.total, 10700); eq(q.daily, 446)
eq(Logic.quoteLoan(1000, 2, 12, -3).rate, 0, 'rate floors at 0')

local bands = { { min = 300, label = 'Very Poor' }, { min = 670, label = 'Good' }, { min = 800, label = 'Excellent' } }
eq(Logic.creditBand(669, bands).label, 'Very Poor')
eq(Logic.creditBand(670, bands).label, 'Good')
eq(Logic.creditBand(100, bands).label, 'Very Poor', 'below range')

-- config editor: sanitize against the defaults --------------------------------------
local tpl = { name = 'LWK', on = true, n = 5, list = { 1, 2 }, rows = { { id = 'a', rate = 1 } }, sub = { x = 1 } }
local v, bad = Logic.sanitize({ name = 'X', on = false, n = '7', list = {}, rows = { { id = 'b', rate = 2, junk = 1 } }, extra = 1 }, tpl)
eq(bad, nil)
eq(v.name, 'X'); eq(v.on, false); eq(v.n, 7, 'numeric string coerced'); eq(#v.list, 0, 'empty list ok')
eq(v.rows[1].id, 'b'); eq(v.rows[1].junk, nil, 'extra row key dropped'); eq(v.extra, nil, 'extra key dropped')
eq(v.sub.x, 1, 'missing key defaulted')
eq(select(2, Logic.sanitize({ on = 'yes' }, tpl)), 'on', 'wrong type')
eq(select(2, Logic.sanitize({ rows = { { rate = 'x' } } }, tpl)), 'rows[1].rate', 'bad row field path')
eq(select(2, Logic.sanitize({ n = 0 / 0 }, tpl)), 'n', 'NaN')
eq(select(2, Logic.sanitize({ sub = 5 }, tpl)), 'sub', 'table expected')

-- config editor: semantic checks ------------------------------------------------------
local function cfg()
    return {
        bankName = 'LWK Bank', accent = '#c8f031', currency = 'USD', sound = { enabled = true, volume = 0.5 },
        accounts = { ibanPrefix = 'LW', maxOwned = 5 }, savingsRates = { personal = 1 }, interaction = { distance = 2 },
        blips = { scale = 0.7 }, logs = { bigAmount = 5 },
        cards = { maxCards = 10, pinAttempts = 3, tiers = { gold = { fee = 1 } } },
        loans = { plans = { { id = 'starter', name = 'Starter', min = 1, max = 2, rate = 1 } }, terms = { 12 },
            bands = { { min = 300, label = 'Poor', adjust = -3 } } },
        banks = { { label = 'Legion', x = -1, y = 2, z = 3, heading = 0 } },
    }
end
eq(Logic.checkConfig(cfg()), nil, 'defaults pass (negative adjust and coords allowed)')
local c = cfg(); c.accent = 'green'; eq(Logic.checkConfig(c), 'accent')
c = cfg(); c.currency = 'usd'; eq(Logic.checkConfig(c), 'currency')
c = cfg(); c.cards.tiers.gold.fee = -1; eq(Logic.checkConfig(c), 'cards.tiers.gold.fee')
c = cfg(); c.loans.plans[1].max = 0; eq(Logic.checkConfig(c), 'loans.plans[1]', 'max below min')
c = cfg(); c.loans.plans[2] = { id = 'starter', name = 'Dup', min = 1, max = 2, rate = 1 }; eq(Logic.checkConfig(c), 'loans.plans[2]', 'duplicate id')
c = cfg(); c.loans.terms = { 1.5 }; eq(Logic.checkConfig(c), 'loans.terms[1]')
c = cfg(); c.sound.volume = 2; eq(Logic.checkConfig(c), 'sound.volume')
c = cfg(); c.banks[1].label = ' '; eq(Logic.checkConfig(c), 'banks[1]')

-- config editor: only changes are saved ---------------------------------------------
local base = { sound = { enabled = true, volume = 0.5 }, accent = '#c8f031', terms = { 12, 24 }, banks = { { label = 'A', x = 1 } } }
eq(Logic.diff(base, base), nil, 'no changes -> nothing saved')
local d = Logic.diff({ sound = { enabled = true, volume = 0.1 }, accent = '#c8f031', terms = { 12, 24 }, banks = { { label = 'A', x = 1 } } }, base)
eq(d.sound.volume, 0.1); eq(d.sound.enabled, nil, 'unchanged sibling not saved'); eq(d.accent, nil); eq(d.terms, nil); eq(d.banks, nil)
d = Logic.diff({ sound = base.sound, accent = '#fff', terms = { 12 }, banks = { { label = 'B', x = 1 } } }, base)
eq(#d.terms, 1, 'changed list saved whole'); eq(d.banks[1].label, 'B'); eq(d.accent, '#fff')
local m = Logic.merge(base, { sound = { volume = 0.2 }, terms = { 5 } })
eq(m.sound.volume, 0.2); eq(m.sound.enabled, true, 'config.lua value kept'); eq(#m.terms, 1); eq(m.terms[1], 5); eq(m.accent, '#c8f031')
eq(Logic.merge(base, {}).accent, '#c8f031')
eq(Logic.diff({ x = 149.0500030517578 }, { x = 149.05 }), nil, 'float32 noise is not a change')
