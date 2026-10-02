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
