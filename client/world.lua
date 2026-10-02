-- World interaction: bank branches + every ATM on the map, via ox_target / qb-target,
-- or a "[E]" prompt when neither is installed. Banks, ATM models and blips come from
-- GlobalState.lwk_bank_world (published by the server) so the config editor applies live.

local function started(res) return GetResourceState(res) == 'started' or GetResourceState(res) == 'starting' end

local target = Config.target ~= 'auto' and Config.target
    or (started('ox_target') and 'ox')
    or (started('qb-target') and 'qb')
    or 'none'

local world = GlobalState.lwk_bank_world or Config
local zones, blips, atmHashes = {}, {}, {}
local promptOpen, atmPrompt = false, false

-- Opening: face the machine/counter, short animation + progress, then the UI. ----------

local function openAt(mode, entity)
    local ped = cache.ped
    if entity and entity ~= 0 then
        TaskTurnPedToFaceEntity(ped, entity, 600)
        Wait(500)
    end
    if world.interaction.openAnim then
        local done = lib.progressBar({
            duration = world.interaction.openTime,
            label = L(mode == 'atm' and 'opening_atm' or 'opening_bank'),
            canCancel = true,
            disable = { move = true, car = true, combat = true },
            anim = mode == 'atm'
                and { dict = 'amb@prop_human_atm@male@idle_a', clip = 'idle_b', flag = 49 }
                or { dict = 'mp_common', clip = 'givetake1_a', flag = 49 },
        })
        ClearPedTasks(ped)
        if not done then return end
    end
    OpenBank(mode)
end

local function option(mode)
    return {
        name = 'lwk_bank_' .. mode,
        icon = mode == 'atm' and 'fas fa-credit-card' or 'fas fa-building-columns',
        label = L(mode == 'atm' and 'target_atm' or 'target_bank'),
        distance = world.interaction.distance,
    }
end

-- Build / tear down ----------------------------------------------------------------

local function clear()
    if target == 'ox' then
        for _, id in ipairs(zones) do exports.ox_target:removeZone(id) end
        exports.ox_target:removeModel(world.atmModels, 'lwk_bank_atm')
    elseif target == 'qb' then
        for _, name in ipairs(zones) do exports['qb-target']:RemoveZone(name) end
        exports['qb-target']:RemoveTargetModel(world.atmModels, L('target_atm'))
    else
        for _, point in ipairs(zones) do point:remove() end
    end
    for _, blip in ipairs(blips) do RemoveBlip(blip) end
    zones, blips = {}, {}
    if promptOpen then lib.hideTextUI() promptOpen = false end
end

local function build()
    atmHashes = {}
    for i, model in ipairs(world.atmModels) do atmHashes[i] = joaat(model) end

    for i, bank in ipairs(world.banks) do
        local pos = vec3(bank.coords.x, bank.coords.y, bank.coords.z)
        if target == 'ox' then
            local opt = option('bank')
            opt.onSelect = function() openAt('bank') end
            zones[#zones + 1] = exports.ox_target:addSphereZone({ coords = pos, radius = 1.5, options = { opt } })
        elseif target == 'qb' then
            local name = 'lwk_bank_' .. i
            local opt = option('bank')
            opt.action = function() openAt('bank') end
            exports['qb-target']:AddCircleZone(name, pos, 1.5, { name = name, useZ = true },
                { options = { opt }, distance = world.interaction.distance })
            zones[#zones + 1] = name
        else
            zones[#zones + 1] = lib.points.new({
                coords = pos, distance = world.interaction.distance,
                onEnter = function() lib.showTextUI(L('prompt_bank')) promptOpen = true end,
                onExit = function() lib.hideTextUI() promptOpen = false end,
                nearby = function() if IsControlJustReleased(0, 38) then openAt('bank') end end,
            })
        end

        if world.blips.enabled then
            local blip = AddBlipForCoord(pos.x, pos.y, pos.z)
            SetBlipSprite(blip, world.blips.sprite)
            SetBlipColour(blip, world.blips.color)
            SetBlipScale(blip, world.blips.scale)
            SetBlipAsShortRange(blip, true)
            BeginTextCommandSetBlipName('STRING')
            AddTextComponentSubstringPlayerName(world.bankName)
            EndTextCommandSetBlipName(blip)
            blips[#blips + 1] = blip
        end
    end

    if target == 'ox' then
        local opt = option('atm')
        opt.onSelect = function(data) openAt('atm', data.entity) end
        exports.ox_target:addModel(world.atmModels, { opt })
    elseif target == 'qb' then
        local opt = option('atm')
        opt.action = function(entity) openAt('atm', entity) end
        exports['qb-target']:AddTargetModel(world.atmModels, { options = { opt }, distance = world.interaction.distance })
    end
end

-- No target resource: find the nearest ATM twice a second (the native costs ~2-4 ms).
CreateThread(function()
    while target == 'none' do
        local pos = GetEntityCoords(cache.ped)
        local atm = 0
        for _, hash in ipairs(atmHashes) do
            atm = GetClosestObjectOfType(pos.x, pos.y, pos.z, world.interaction.distance, hash, false, false, false)
            if atm ~= 0 then break end
        end
        if atm ~= 0 then
            if not atmPrompt then lib.showTextUI(L('prompt_atm')) atmPrompt = true end
            local until_ = GetGameTimer() + 500
            while GetGameTimer() < until_ do
                if IsControlJustReleased(0, 38) then
                    lib.hideTextUI() atmPrompt = false
                    openAt('atm', atm)
                    break
                end
                Wait(0)
            end
        else
            if atmPrompt then lib.hideTextUI() atmPrompt = false end
            Wait(500)
        end
    end
end)

CreateThread(build)

AddStateBagChangeHandler('lwk_bank_world', 'global', function(_, _, value)
    if not value then return end
    clear()
    world = value
    Locale.reload(value.locale or Config.locale)
    build()
end)

AddEventHandler('onResourceStop', function(res)
    if res == GetCurrentResourceName() then clear() end
end)
