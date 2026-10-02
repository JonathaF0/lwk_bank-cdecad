# Changelog

All notable changes to LWK Bank. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

First public release, planned as 1.0.0.

### Added
- Animated bank and ATM UI: transfers (to several people at once), activity, cards, savings, loans, bills and accounts.
- Works with Qbox, QBCore and ESX (detected automatically), ox_target / qb-target or a "Press E" prompt, and ox / qb / qs inventories or a no-items mode.
- Bank cards as items with PIN, daily limit, freeze and renewal; ATMs only accept cards the player carries. Card and receipt item images included.
- Using a receipt item opens a printed slip with the transaction details.
- Weekly savings interest and savings goals; loans with a 300-850 credit score, grace period, late fees and auto-collection.
- Bills from okokBilling, esx_billing and QBCore phone invoices, plus jg-dealerships vehicle finance.
- Personal, shared and business accounts; business accounts for job and gang bosses.
- Drop-in replacement for Renewed-Banking, qb-banking, qb-management and okokBanking: their exports keep working, and `/bankimport` brings balances over (preview first).
- lation_shops purchases and sales paid by bank show in the player's activity.
- Notifications through ox_lib, okokNotify, wasabi_notify, or the ESX / QBCore / Qbox built-ins.
- `/bankconfig` in-game settings editor that applies changes live; ATM spots for ATMs built into buildings.
- Discord webhook / ox_lib logging and admin commands (`/bankadmin`, `/bankpin`, `/bankunfreeze`, `/bankscore`).
- Translations through `locales/`, with dates and money in the language's own format.
