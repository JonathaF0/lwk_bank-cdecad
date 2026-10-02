# LWK Bank

A free, open-source bank for FiveM by **LWK Development**. Animated 3D UI, real ATMs and bank cards, savings goals, loans with credit scores, bills, shared and business accounts, and an in-game settings editor, so you never have to touch a config file.

Works with **Qbox, QBCore and ESX** (detected automatically).

## Features

- **Bank and ATM.** Bank counters at every Fleeca/Pacific branch, plus every ATM prop in the map. A short animation plays before the UI opens.
- **Transfers** by IBAN or saved contact, to several people at once. Hold-to-confirm, and the receiver gets a live toast.
- **Cards** in three tiers. Each card has a PIN, a daily limit, freeze, renewal, auto-renew, and is a real inventory item (ox / qb / qs). There's also a no-items mode.
- **Savings** with weekly interest and savings goals.
- **Loans** with plans, terms, a 300–850 credit score that moves with how you pay, a grace period, late fees and auto-collection.
- **Bills** read from okokBilling, esx_billing or QBCore phone invoices. Pay one or all of them, and print receipts as items.
- **Accounts**: personal, shared (members with per-permission access) and business accounts for job bosses. On ESX, business accounts use `esx_addonaccount`, so boss menus keep working.
- **Logs** to a Discord webhook and/or ox_lib's logger. Big amounts are flagged.
- **Admin tools**: `/bankconfig` (in-game settings), plus commands to look up players, reset PINs, unfreeze cards and set credit scores.
- **Translations**: every string lives in `locales/<code>.json`, and dates and money use the language's own formats.
- **Sounds**: short, quiet, realistic (CC0). They can be turned off or replaced.

## Requirements

| Resource | Why |
| --- | --- |
| [ox_lib](https://github.com/overextended/ox_lib) | callbacks, notifications, commands, progress bar, cron |
| [oxmysql](https://github.com/overextended/oxmysql) | database |
| qbx_core, qb-core **or** es_extended | your framework |
| ox_target or qb-target *(optional)* | look-at interaction. Without one, players get a "Press E" prompt |
| ox_inventory, qb-inventory or qs-inventory *(optional)* | cards and receipts as items |
| okokBilling / esx_billing / QBCore invoices *(optional)* | the Bills tab |

## Installation

1. **Download** the latest release and put the folder in your `resources`. Name the folder **`lwk_bank`**: no spaces, and not `lwk_bank-main`. Other scripts use that name to call its exports.
2. **Start it after** your framework, ox_lib, oxmysql, target and inventory, in `server.cfg`:
   ```cfg
   ensure ox_lib
   ensure oxmysql
   # ...framework, target, inventory...
   ensure lwk_bank
   ```
3. **Give admins access** to `/bankconfig` and the admin commands:
   ```cfg
   add_ace group.admin lwk_bank.admin allow
   ```
   On ESX, the `admin` and `superadmin` groups also work (see `admin.esxGroups` in `config.lua`).
4. **Add the items** (skip this if you don't use an inventory). See [Items](#items) below.
5. **Remove your old bank** (qb-banking, Renewed-Banking, esx_banking, okokBanking...) so two banks don't fight over the same counters. If another script calls your old bank's exports, switch it to [LWK Bank's exports](#exports).
6. **Restart the server.** The database tables are created automatically on first start. `sql/install.sql` is there if you'd rather run it yourself.

That's it. Join the server, walk up to a bank counter or ATM, and press the target or E.

### Items

Images are not included. Use any 100×100 PNG named `bank_card.png` / `bank_receipt.png` in your inventory's image folder.

**ox_inventory** (also used by Qbox): `ox_inventory/data/items.lua`
```lua
['bank_card'] = {
    label = 'Bank Card', weight = 10, stack = false, close = true,
    description = 'A debit card. Use it at any ATM.',
},
['bank_receipt'] = {
    label = 'Bank Receipt', weight = 1, stack = false,
},
```

**qb-inventory**: `qb-core/shared/items.lua`
```lua
bank_card    = { name = 'bank_card',    label = 'Bank Card',    weight = 10, type = 'item', image = 'bank_card.png',    unique = true, useable = false, shouldClose = true, description = 'A debit card. Use it at any ATM.' },
bank_receipt = { name = 'bank_receipt', label = 'Bank Receipt', weight = 1,  type = 'item', image = 'bank_receipt.png', unique = true, useable = false, shouldClose = true, description = 'A bank receipt.' },
```

**qs-inventory**: `qs-inventory/shared/items.lua`
```lua
['bank_card']    = { ['name'] = 'bank_card',    ['label'] = 'Bank Card',    ['weight'] = 10, ['type'] = 'item', ['image'] = 'bank_card.png',    ['unique'] = true, ['useable'] = false, ['shouldClose'] = true, ['description'] = 'A debit card. Use it at any ATM.' },
['bank_receipt'] = { ['name'] = 'bank_receipt', ['label'] = 'Bank Receipt', ['weight'] = 1,  ['type'] = 'item', ['image'] = 'bank_receipt.png', ['unique'] = true, ['useable'] = false, ['shouldClose'] = true, ['description'] = 'A bank receipt.' },
```

When a card is ordered, the player gets the item. At an ATM they can only use cards they're carrying. With no inventory (`inventory = 'none'`), cards live only in the bank app and ATMs show all of them.

## Configuration

You have two options:

- **In game (recommended):** type **`/bankconfig`**. Every option has a label and a short explanation. Changes apply instantly for everyone, with no restart. "Add bank here" saves your current position as a new bank counter. "Reset to defaults" goes back to `config.lua`.
- **`config.lua`:** the defaults. Anything saved in-game overrides this file. A few things can only be set here, because changing them live could break the server or lock staff out:
  - `framework`, `inventory`, `target`, `billing` (all `auto` by default)
  - `debug` (adds `/bank` and `/atm` test commands)
  - `admin` (who counts as staff)
  - `interestDay` (needs a restart)

### Language

Set `locale` (in `/bankconfig` → General, or `config.lua`) to the name of a file in `locales/`. To add a language:

1. Copy `locales/en.json` to `locales/<code>.json` (e.g. `de.json`).
2. Set `meta.intl` to the language's locale code (e.g. `de-DE`). Dates and money formats follow it.
3. Translate the values, never the keys. Keep placeholders as they are: `{name}`, `{amount}` and `%s`.

Missing strings fall back to English, so a half-done translation still works. Pull requests with new languages are welcome!

### Branding

Change `bankName`, `accent` (any hex colour; text on it switches between dark and light automatically) and `currency` (any ISO code, e.g. `EUR`) in `/bankconfig` → General.

## Commands

| Command | Who | What |
| --- | --- | --- |
| `/bankconfig` | admins | In-game settings editor |
| `/bankadmin <id or identifier>` | admins | A player's accounts, cards, loans and credit score |
| `/bankpin <id or identifier> <last 4>` | admins | Reset a card's PIN (the new PIN is sent to the player) |
| `/bankunfreeze <id or identifier> <last 4>` | admins | Unfreeze a card that was locked by wrong PINs |
| `/bankscore <id or identifier> <300-850>` | admins | Set a credit score |
| `/bank`, `/atm` | everyone, only with `debug = true` | Open without walking to one |

Every admin action is logged.

## Exports

```lua
-- client: open the bank or the ATM screen from your own script (phone, NPC, etc.)
exports.lwk_bank:OpenBank('bank') -- or 'atm'

-- server: job/society money (business accounts), e.g. for shops, mechanics, billing
exports.lwk_bank:AddBusinessMoney('mechanic', 500, 'Repair')       --> true/false
exports.lwk_bank:RemoveBusinessMoney('mechanic', 200, 'Parts')     --> true/false
exports.lwk_bank:GetBusinessBalance('mechanic')                    --> number
```

Players' main account **is** their framework bank money, so anything that pays salaries or charges bank money through your framework shows up in LWK Bank automatically.

## Logs

In `/bankconfig` → Logs:
- **Discord webhook**: paste a webhook URL. Leave it empty to turn logs off.
- **ox_lib logger**: also send logs to ox_lib's logger (Datadog/Fivemanage/etc.; set the `ox:logger` convar).
- **Flag amounts from**: withdrawals and transfers at or above this amount are marked ⚠.

## Developing the UI

The UI is React + Vite in `web/`, and builds into `html/` (which is what FiveM loads).

```bash
cd web
npm install
npm run dev     # opens in the browser with mock data and a dev toolbar
npm run build   # rebuilds html/
```

Lua checks and specs (no FiveM needed):

```bash
cd tests
npm install
npm test
```

## Credits

- Made by **LWK Development**.
- Sounds are CC0. See `html/sounds/CREDITS.txt`.
- Fonts: Archivo and JetBrains Mono (SIL Open Font License), bundled through Fontsource.

## Support

Free support is available in the LWK Development Discord. Please include your framework, inventory, target, and any F8/server console errors.

## License

[MIT](LICENSE)
