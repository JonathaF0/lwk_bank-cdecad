-- NUI bridge: opens/closes the UI and forwards every UI action to the server.

local isOpen = false

-- Every action the UI can send (see web/src/nui.ts). Each one maps 1:1 to a
-- server callback 'lwk_bank:<event>' that returns a Result.
local ACTIONS = {
    'deposit', 'withdraw', 'transfer', 'contactSave', 'contactDelete', 'verifyPin',
    'cardOrder', 'cardActivate', 'cardBlock', 'cardRenew', 'cardAutoRenew', 'cardPin', 'cardLimit', 'cardDelete',
    'savingsMove', 'goalCreate', 'goalMove', 'goalDelete',
    'loanApply', 'loanPay', 'billPay', 'billPayAll', 'receiptPrint',
    'accountCreate', 'accountRename', 'accountDelete', 'accountIban', 'memberAdd', 'memberRemove', 'memberPerms',
}

for _, action in ipairs(ACTIONS) do
    RegisterNUICallback(action, function(data, cb)
        cb(lib.callback.await('lwk_bank:' .. action, false, data) or { ok = false, error = L('err_generic') })
    end)
end

local function close()
    isOpen = false
    SetNuiFocus(false, false)
    lib.callback.await('lwk_bank:close', false)
end

RegisterNUICallback('close', function(_, cb)
    close()
    cb({})
end)

--- Opens the bank ('bank') or the ATM flow ('atm'). Returns false if the server refused.
function OpenBank(mode)
    if isOpen then return false end
    local data = lib.callback.await('lwk_bank:open', false, mode)
    if not data then
        lib.notify({ title = Config.bankName, description = L('err_not_here'), type = 'error' })
        return false
    end
    isOpen = true
    SendNUIMessage({ action = mode == 'atm' and 'openAtm' or 'open', data = data })
    SetNuiFocus(true, true)
    return true
end
exports('OpenBank', OpenBank)

RegisterNetEvent('lwk_bank:update', function(data)
    if isOpen then SendNUIMessage({ action = 'update', data = data }) end
end)

-- Money arrived from someone else: a toast in the UI if it's open, a notification if not.
RegisterNetEvent('lwk_bank:incoming', function(amount, from)
    if isOpen then
        SendNUIMessage({ action = 'incoming', amount = amount, from = from })
    else
        lib.notify({ title = Config.bankName, description = L('incoming', amount, from), type = 'success' })
    end
end)

-- The server can force the UI shut (e.g. account deleted by an admin).
RegisterNetEvent('lwk_bank:forceClose', function()
    if isOpen then
        SendNUIMessage({ action = 'close' })
        close()
    end
end)

AddEventHandler('onResourceStop', function(res)
    if res == GetCurrentResourceName() and isOpen then SetNuiFocus(false, false) end
end)

if Config.debug then
    RegisterCommand('bank', function() OpenBank('bank') end, false)
    RegisterCommand('atm', function() OpenBank('atm') end, false)
end
