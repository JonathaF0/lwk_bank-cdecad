-- Third-party scripts that move money outside the bank UI, shown in the player's activity.
-- (jg-dealerships finance shows up as bills: see bridge/billing.lua.)

-- lation_shops: buying or selling with bank money. Shop and society balances already go
-- through LWK Bank via its Renewed-Banking / qb-banking / okokBanking support (compat.lua).
local function shopName(shopId)
    local ok, shop = pcall(function() return exports.lation_shops:GetShop(shopId) end)
    return ok and type(shop) == 'table' and shop.title or nil
end

local function cashless(method)
    method = tostring(method or ''):lower()
    return method ~= '' and method ~= 'cash' and method ~= 'money'
end

local function shopActivity(data, incoming)
    if type(data) ~= 'table' or not data.identifier then return end
    local amount = Logic.amount(math.floor(tonumber(data.total) or 0))
    if not amount or not cashless(incoming and data.paymentSource or data.paymentMethod) then return end
    local row = Accounts.ensureDefault(data.identifier)
    Accounts.log(row.id, incoming and 'transfer_in' or 'transfer_out', amount, L(incoming and 'tx_shop_sale' or 'tx_shop_purchase'),
        shopName(data.shopId))
end

AddEventHandler('lation_shops:purchase', function(data) shopActivity(data, false) end)
AddEventHandler('lation_shops:sale', function(data) shopActivity(data, true) end)
