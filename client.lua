-- Test harness: opens the UI in-game before the real backend exists.
-- Swap testData() and the callbacks for your framework (QBCore / ESX / Qbox).
-- The full NUI contract (messages, callbacks, payloads) is at the top of web/src/nui.ts.

local function testData()
  local name = GetPlayerName(PlayerId())
  local now = GetCloudTimeAsInt() * 1000
  local day = 86400000
  return {
    config = Config.ForUI(),
    player = { name = name, cash = 500 },
    creditScore = 680,
    accounts = {
      { id = 'acc1', type = 'personal', name = 'Everyday', iban = 'LW000001', balance = 10000, savings = 2500,
        goals = { { id = 'g1', name = 'First car', target = 20000, saved = 4000 } },
        history = { 8200, 8900, 8700, 9400, 9600, 9800, 10000 },
        interestHistory = { { date = now - 7 * day, amount = 45 } },
        nextInterestAt = now + 2 * day, openedAt = now - 30 * day, role = 'owner' },
    },
    transactions = {
      { id = 'tx1', accountId = 'acc1', type = 'paycheck', amount = 1850, label = 'Paycheck', date = now },
    },
    contacts = { { id = 'c1', name = 'Test Contact', iban = 'LW000002' } },
    cards = {
      { id = 'card1', accountId = 'acc1', tier = 'premium', last4 = '0001', holder = name, expiresAt = now + 60 * day,
        status = 'active', dailyLimit = 25000, spentToday = 0, autoRenew = false },
    },
    loans = {},
    bills = {
      { id = 'b1', label = 'Test bill', issuer = 'LSPD', amount = 250, issuedAt = now, status = 'unpaid' },
    },
  }
end

local function open(action)
  SetNuiFocus(true, true)
  SendNUIMessage({ action = action, data = testData() })
end

RegisterCommand('bank', function() open('open') end, false)
RegisterCommand('atm', function() open('openAtm') end, false)

RegisterNUICallback('close', function(_, cb)
  SetNuiFocus(false, false)
  cb({})
end)

RegisterNUICallback('verifyPin', function(data, cb)
  -- ponytail: hardcoded test PIN; the real check must happen server-side against the stored PIN.
  if data.pin == '1234' then cb({ ok = true }) else cb({ ok = false, error = 'Incorrect PIN' }) end
end)

-- Not wired yet: the UI shows this as an inline error (and plays the error sound).
local events = {
  'deposit', 'withdraw', 'transfer', 'contactSave', 'contactDelete',
  'cardOrder', 'cardActivate', 'cardBlock', 'cardRenew', 'cardAutoRenew', 'cardPin', 'cardLimit', 'cardDelete',
  'savingsMove', 'goalCreate', 'goalMove', 'goalDelete',
  'loanApply', 'loanPay', 'billPay', 'billPayAll', 'receiptPrint',
  'accountCreate', 'accountRename', 'accountDelete', 'accountIban', 'memberAdd', 'memberRemove', 'memberPerms',
}
for _, event in ipairs(events) do
  RegisterNUICallback(event, function(_, cb)
    cb({ ok = false, error = 'Bank backend not connected yet' })
  end)
end
