fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'lwk_bank'
author 'LWK Development'
version '1.0.0'
description 'LWK Bank - banking for QBCore, Qbox and ESX'

ui_page 'html/index.html'

files {
  'html/index.html',
  'html/assets/*',
  'html/sounds/*',
  'locales/*.json',
  'images/*.png',
}

shared_scripts {
  '@ox_lib/init.lua',
  'config.lua',
  'shared/locale.lua',
  'bridge/notify.lua',
}

server_scripts {
  '@oxmysql/lib/MySQL.lua',
  'server/settings.lua',
  'bridge/framework.lua',
  'bridge/inventory.lua',
  'bridge/billing.lua',
  'server/logic.lua',
  'server/logs.lua',
  'server/business.lua',
  'server/accounts.lua',
  'server/main.lua',
  'server/manage.lua',
  'server/cards.lua',
  'server/savings.lua',
  'server/loans.lua',
  'server/bills.lua',
  'server/admin.lua',
  'server/compat.lua',
}

client_scripts {
  'client/main.lua',
  'client/world.lua',
}

dependencies {
  'ox_lib',
  'oxmysql',
}

-- Drop-in replacement: scripts that depend on or call these banks get LWK Bank instead
-- (server/compat.lua answers their exports). Remove the original resources.
provide 'Renewed-Banking'
provide 'qb-banking'
provide 'qb-management'
provide 'okokBanking'
