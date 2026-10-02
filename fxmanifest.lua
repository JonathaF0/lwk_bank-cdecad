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
}

shared_scripts {
  '@ox_lib/init.lua',
  'config.lua',
  'shared/locale.lua',
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
}

client_scripts {
  'client/main.lua',
  'client/world.lua',
}

dependencies {
  'ox_lib',
  'oxmysql',
}
