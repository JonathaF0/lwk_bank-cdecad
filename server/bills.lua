-- Bills (via config/bridge/billing.lua) and printed receipts (inventory items).

Bills = {}

local ok, fail = Bank.ok, Bank.fail

CreateThread(function()
    MySQL.query.await([[CREATE TABLE IF NOT EXISTS `lwk_bank_bill_history` (
        `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, `identifier` VARCHAR(64) NOT NULL,
        `label` VARCHAR(64) NOT NULL, `issuer` VARCHAR(64) NOT NULL, `amount` BIGINT NOT NULL,
        `issued_at` BIGINT NOT NULL, `paid_at` BIGINT NOT NULL,
        PRIMARY KEY (`id`), KEY `identifier` (`identifier`))]])
end)

local function enabled() return Cfg().features.bills and Billing.kind ~= 'none' end

function Bills.forPlayer(_, identifier)
    if not enabled() then return {} end
    local out = {}
    for _, b in ipairs(Billing.unpaid(identifier)) do
        out[#out + 1] = { id = b.id, label = b.label, issuer = b.issuer, amount = b.amount, issuedAt = b.issuedAt, status = 'unpaid' }
    end
    for _, h in ipairs(MySQL.query.await('SELECT * FROM lwk_bank_bill_history WHERE identifier = ? ORDER BY paid_at DESC LIMIT 25', { identifier })) do
        out[#out + 1] = { id = 'h' .. h.id, label = h.label, issuer = h.issuer, amount = h.amount, issuedAt = h.issued_at,
            status = 'paid', paidAt = h.paid_at }
    end
    return out
end

local function payOne(src, identifier, row, bill)
    if bill.payTo.jg then
        if not Billing.payFinance(src, row, bill) then return false end
    else
        if not Accounts.debit(row, bill.amount, src) then return false end
        Billing.settle(bill.id)
        Billing.payout(bill)
    end
    Accounts.log(row.id, 'bill', bill.amount, bill.label ~= '' and bill.label or L('tx_bill'), bill.issuer)
    MySQL.insert.await('INSERT INTO lwk_bank_bill_history (identifier, label, issuer, amount, issued_at, paid_at) VALUES (?, ?, ?, ?, ?, ?)',
        { identifier, bill.label, bill.issuer, bill.amount, bill.issuedAt, Logic.now() })
    return true
end

local function payable(src, identifier, accountId)
    if not enabled() then return nil, L('err_disabled') end
    local row, err = Accounts.open(src, identifier, accountId)
    if not row then return nil, err end
    if not row.perms.withdraw then return nil, L('err_perm_withdraw') end
    return row
end

Bank.action('billPay', function(src, identifier, p)
    local row, err = payable(src, identifier, p.accountId)
    if not row then return fail(err) end
    for _, bill in ipairs(Billing.unpaid(identifier)) do
        if bill.id == tostring(p.billId) then
            if not payOne(src, identifier, row, bill) then return fail(L('err_funds')) end
            return ok(src)
        end
    end
    return fail(L('err_bill_missing'))
end)

Bank.action('billPayAll', function(src, identifier, p)
    local row, err = payable(src, identifier, p.accountId)
    if not row then return fail(err) end
    local due, total = Billing.unpaid(identifier), 0
    for _, b in ipairs(due) do total = total + b.amount end
    if #due == 0 then return fail(L('err_bill_none')) end
    if Accounts.balance(row, src) < total then return fail(L('err_funds')) end
    for _, bill in ipairs(due) do
        if not payOne(src, identifier, row, bill) then break end
    end
    return ok(src)
end)

-- Receipts ---------------------------------------------------------------------------------

local function receiptFor(src, identifier, kind, id)
    if kind == 'bill' then
        local h = MySQL.single.await('SELECT * FROM lwk_bank_bill_history WHERE id = ? AND identifier = ?',
            { tonumber(tostring(id):gsub('^h', '')), identifier })
        return h and { title = L('receipt_bill'), ref = 'B' .. h.id, amount = h.amount, incoming = false, label = h.label,
            party = h.issuer, at = h.paid_at }
    end
    local tx = MySQL.single.await('SELECT * FROM lwk_bank_transactions WHERE id = ?', { tonumber(id) })
    local acc = tx and Accounts.open(src, identifier, tx.account_id)
    if not acc then return nil end
    return { title = L('receipt_tx'), ref = 'T' .. tx.id, amount = tx.amount, incoming = Logic.isIncoming(tx.type),
        type = tx.type, label = tx.label, party = tx.counterparty or '', at = tx.created_at, account = acc.name, iban = acc.iban }
end

Bank.action('receiptPrint', function(src, identifier, p)
    if not Cfg().features.receipts then return fail(L('err_disabled')) end
    if not Inv.enabled() then return fail(L('err_receipt_inventory')) end
    local r = receiptFor(src, identifier, p.kind, p.id)
    if not r then return fail(L('err_receipt_missing')) end
    local when = os.date('%Y-%m-%d %H:%M', math.floor(r.at / 1000))
    r.bank = Cfg().bankName
    local metadata = {
        label = ('%s · $%s'):format(r.title, r.amount),
        description = ('%s · $%s%s · %s · %s'):format(r.label, r.amount, r.party ~= '' and (' · ' .. r.party) or '', when, r.bank),
        receipt = r, -- read by the receipt view when the item is used
    }
    if not Inv.give(src, Cfg().receipts.item, metadata) then return fail(L('err_receipt_space')) end
    return ok(src)
end)

-- Using a receipt item shows it. ox_inventory calls the client export from the item
-- definition (see README); qb/qs inventories register it as a usable item here.
Inv.onUse(Cfg().receipts.item, function(src, metadata)
    TriggerClientEvent('lwk_bank:showReceipt', src, metadata or {})
end)
