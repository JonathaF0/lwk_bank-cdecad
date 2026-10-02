-- Inventory bridge (server): bank cards and receipts as real items.
-- ox_inventory > qs-inventory > qb-inventory, or 'none' (cards live only in the bank UI).

Inv = {}

local function started(res) return GetResourceState(res) == 'started' or GetResourceState(res) == 'starting' end

local kind = Config.inventory ~= 'auto' and Config.inventory
    or (started('ox_inventory') and 'ox')
    or (started('qs-inventory') and 'qs')
    or (started('qb-inventory') and 'qb')
    or 'none'
Inv.kind = kind

function Inv.enabled() return kind ~= 'none' end

--- Give one item with metadata. Returns true on success.
function Inv.give(src, item, metadata)
    if kind == 'ox' then
        return exports.ox_inventory:AddItem(src, item, 1, metadata) == true
    elseif kind == 'qs' then
        return exports['qs-inventory']:AddItem(src, item, 1, nil, metadata) ~= false
    elseif kind == 'qb' then
        return exports['qb-inventory']:AddItem(src, item, 1, false, metadata, 'lwk_bank') ~= false
    end
    return false
end

--- Every slot holding `item`, as { slot = n, metadata = {...} }.
local function slots(src, item)
    local out = {}
    if kind == 'ox' then
        for _, s in pairs(exports.ox_inventory:Search(src, 'slots', item) or {}) do
            out[#out + 1] = { slot = s.slot, metadata = s.metadata or {} }
        end
    elseif kind == 'qs' then
        for slot, s in pairs(exports['qs-inventory']:GetInventory(src) or {}) do
            if s.name == item then out[#out + 1] = { slot = s.slot or slot, metadata = s.info or {} } end
        end
    elseif kind == 'qb' then
        for _, s in pairs(exports['qb-inventory']:GetItemsByName(src, item) or {}) do
            out[#out + 1] = { slot = s.slot, metadata = s.info or {} }
        end
    end
    return out
end

--- Set of cardIds whose card items `src` is carrying.
function Inv.heldCards(src, item)
    local held = {}
    for _, s in ipairs(slots(src, item)) do
        if s.metadata.cardId then held[tostring(s.metadata.cardId)] = true end
    end
    return held
end

--- Remove the item whose metadata.cardId matches. Returns true if one was removed.
function Inv.removeCard(src, item, cardId)
    for _, s in ipairs(slots(src, item)) do
        if tostring(s.metadata.cardId) == tostring(cardId) then
            if kind == 'ox' then return exports.ox_inventory:RemoveItem(src, item, 1, nil, s.slot) == true end
            if kind == 'qs' then return exports['qs-inventory']:RemoveItem(src, item, 1, s.slot) ~= false end
            if kind == 'qb' then return exports['qb-inventory']:RemoveItem(src, item, 1, s.slot, 'lwk_bank') ~= false end
        end
    end
    return false
end

--- Calls fn(src, metadata) when a player uses `item`. ox_inventory instead calls the
--- client export named in the item definition (client.export = 'lwk_bank.useReceipt').
function Inv.onUse(item, fn)
    if kind == 'qs' then
        exports['qs-inventory']:CreateUsableItem(item, function(src, data) fn(src, data and (data.info or data.metadata)) end)
    elseif kind == 'qb' and started('qb-core') then
        exports['qb-core']:GetCoreObject().Functions.CreateUseableItem(item, function(src, data)
            fn(src, data and (data.info or data.metadata))
        end)
    end
end
