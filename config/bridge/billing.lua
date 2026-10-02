-- Billing bridge (server): reads and settles bills from the server's billing resource.
--   okok -> okokBilling (table okokbilling, status column)
--   esx  -> esx_billing (table billing; paid bills are deleted)
--   qb   -> QBCore/Qbox phone invoices (table phone_invoices; paid invoices are deleted)
-- Paid bills are also recorded in lwk_bank_bill_history so the UI can show history everywhere.

Billing = {}

local function started(res) return GetResourceState(res) == 'started' or GetResourceState(res) == 'starting' end

local kind = Config.billing ~= 'auto' and Config.billing
    or (started('okokBilling') and 'okok')
    or (started('esx_billing') and 'esx')
    or ((Bridge.framework == 'qb' or Bridge.framework == 'qbox') and 'qb')
    or 'none'
Billing.kind = kind

-- phone_invoices only exists if a phone created it; check once so 'qb' degrades to 'none'.
CreateThread(function()
    if kind == 'qb' and not MySQL.scalar.await("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'phone_invoices'") then
        kind, Billing.kind = 'none', 'none'
    end
end)

local function job(society)
    if type(society) ~= 'string' then return nil end
    return (society:gsub('^society_', ''))
end

--- Unpaid bills: { id, label, issuer, amount, issuedAt, payTo = { job = ? , identifier = ? } }
function Billing.unpaid(identifier)
    local out = {}
    if kind == 'okok' then
        for _, b in ipairs(MySQL.query.await([[SELECT id, item, society, society_name, author_name, invoice_value,
                UNIX_TIMESTAMP(sent_date) * 1000 AS sent FROM okokbilling WHERE receiver_identifier = ? AND status = 'unpaid']], { identifier })) do
            out[#out + 1] = { id = tostring(b.id), label = b.item or '', issuer = b.society_name or b.author_name or '',
                amount = b.invoice_value, issuedAt = math.floor(b.sent or Logic.now()), payTo = { job = job(b.society) } }
        end
    elseif kind == 'esx' then
        for _, b in ipairs(MySQL.query.await('SELECT * FROM billing WHERE identifier = ?', { identifier })) do
            out[#out + 1] = { id = tostring(b.id), label = b.label, issuer = b.target_type == 'society' and job(b.target) or Bridge.offlineName(b.sender),
                amount = b.amount, issuedAt = Logic.now(),
                payTo = b.target_type == 'society' and { job = job(b.target) } or { identifier = b.target } }
        end
    elseif kind == 'qb' then
        for _, b in ipairs(MySQL.query.await('SELECT * FROM phone_invoices WHERE citizenid = ?', { identifier })) do
            out[#out + 1] = { id = tostring(b.id), label = b.reason or b.society or '', issuer = b.sender or b.society or '',
                amount = b.amount, issuedAt = Logic.now(), payTo = { job = b.society } }
        end
    end
    -- jg-dealerships: each financed vehicle's next payment is a bill.
    if started('jg-dealerships') then
        local ok, vehicles = pcall(function() return exports['jg-dealerships']:getPlayerFinancedVehicles(identifier) end)
        for _, v in ipairs(ok and type(vehicles) == 'table' and vehicles or {}) do
            local f = type(v.finance_data) == 'string' and json.decode(v.finance_data) or v.finance_data or {}
            local amount = math.floor(tonumber(f.recurring_payment) or 0)
            if amount > 0 then
                out[#out + 1] = { id = 'jg:' .. v.plate, amount = amount, issuedAt = Logic.now(), payTo = { jg = v.plate },
                    label = L('bill_finance', v.plate, (tonumber(f.payments_complete) or 0) + 1, f.total_payments or '?'), issuer = L('bill_finance_issuer') }
            end
        end
    end
    return out
end

--- Pays a jg-dealerships finance bill. jg takes the payment from the player's bank money
--- itself, so money from any other LWK account is moved there first (and back on failure).
function Billing.payFinance(src, row, bill)
    local moved = not Logic.flag(row.is_default)
    if moved then
        if not Accounts.debit(row, bill.amount, src) then return false end
        -- If the money can't reach the bank, stop: jg would charge whatever is already there.
        if not Bridge.addMoney(src, 'bank', bill.amount, 'lwk_bank finance') then
            Accounts.credit(row, bill.amount)
            return false
        end
    elseif Bridge.getMoney(src, 'bank') < bill.amount then
        return false
    end
    local ok, paid = pcall(function() return exports['jg-dealerships']:makeFinancePayment(src, bill.payTo.jg) end)
    if ok and paid then return true end
    -- Only give it back if it's still in the bank (jg may have charged before erroring).
    if moved and Bridge.removeMoney(src, 'bank', bill.amount, 'lwk_bank finance') then
        Accounts.credit(row, bill.amount)
    end
    return false
end

--- Marks a bill settled in the billing resource's own table.
function Billing.settle(billId)
    if kind == 'okok' then
        MySQL.update.await("UPDATE okokbilling SET status = 'paid', paid_date = NOW() WHERE id = ?", { tonumber(billId) })
    elseif kind == 'esx' then
        MySQL.update.await('DELETE FROM billing WHERE id = ?', { tonumber(billId) })
    elseif kind == 'qb' then
        MySQL.update.await('DELETE FROM phone_invoices WHERE id = ?', { tonumber(billId) })
    end
end

--- Sends a paid bill's money to whoever issued it.
-- ponytail: okokBilling's author commission isn't split out; the society gets the full amount.
function Billing.payout(bill)
    if bill.payTo.job and bill.payTo.job ~= '' then
        return Business.addToJob(bill.payTo.job, bill.amount, bill.label)
    end
    if bill.payTo.identifier then
        local target = Bridge.sourceOf(bill.payTo.identifier)
        if target then return Bridge.addMoney(target, 'bank', bill.amount, 'lwk_bank bill') end
        return Bridge.addBankOffline(bill.payTo.identifier, bill.amount)
    end
    return false
end
