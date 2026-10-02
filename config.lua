Config = {}

-- Branding ---------------------------------------------------------------
Config.BankName = 'LWK Bank'
Config.Accent   = '#c8f031'   -- any hex colour; text on it switches dark/light automatically
Config.Currency = 'USD'       -- ISO 4217 code, used for number formatting only

-- Features: false removes the section from the UI entirely ------------------
Config.Features = {
  cards            = true,
  savings          = true,
  loans            = true,
  bills            = true,   -- needs okokBilling (or your own billing) on the server
  accounts         = true,   -- open/rename/close accounts, members and permissions
  multiTransfer    = true,   -- send to several people in one go
  contacts         = true,   -- saved transfer contacts
  receipts         = true,   -- "print receipt" buttons on transactions and bills
  customIban       = true,
  customCardLimits = true,
}

-- Sound ---------------------------------------------------------------------
Config.Sound = {
  enabled = true,
  volume  = 0.5,             -- 0.0 - 1.0
}

-- Cards -----------------------------------------------------------------------
Config.Cards = {
  tiers = {
    standard = { dailyLimit = 5000,   fee = 250 },
    premium  = { dailyLimit = 25000,  fee = 1500 },
    gold     = { dailyLimit = 100000, fee = 7500 },
  },
  maxCards      = 10,
  maxActive     = 3,
  activationFee = 100,
  renewalFee    = 500,
  validDays     = 90,
}

-- Savings: weekly interest % by account type ----------------------------------
Config.SavingsRates = { personal = 0.5, shared = 0.75, business = 1.0 }

-- Loans -------------------------------------------------------------------------
Config.Loans = {
  plans = {
    { id = 'starter',   name = 'Starter',   min = 1000,   max = 10000,   rate = 12 },
    { id = 'standard',  name = 'Standard',  min = 10000,  max = 50000,   rate = 10 },
    { id = 'premium',   name = 'Premium',   min = 50000,  max = 150000,  rate = 8 },
    { id = 'executive', name = 'Executive', min = 150000, max = 500000,  rate = 6 },
    { id = 'custom',    name = 'Custom',    min = 500,    max = 1000000, rate = 14 },
  },
  terms             = { 12, 24, 36, 48, 60 },  -- repayment days
  maxActive         = 4,
  balanceMultiplier = 3,                       -- borrowing limit = total balance x this
  graceHours        = 6,
  -- Credit score 300-850. adjust = percentage points added to a loan's rate.
  bands = {
    { min = 300, label = 'Very Poor', adjust = 3 },
    { min = 500, label = 'Poor',      adjust = 2 },
    { min = 580, label = 'Fair',      adjust = 1 },
    { min = 670, label = 'Good',      adjust = 0 },
    { min = 740, label = 'Very Good', adjust = -1.5 },
    { min = 800, label = 'Excellent', adjust = -3 },
  },
}

-- Accounts ------------------------------------------------------------------------
Config.Accounts = {
  maxOwned    = 5,
  creationFee = 500,     -- cash
  ibanFee     = 2500,
  ibanPrefix  = 'LW',
}

-- The shape the UI expects (see web/src/nui.ts -> BankConfig).
function Config.ForUI()
  return {
    bankName     = Config.BankName,
    accent       = Config.Accent,
    currency     = Config.Currency,
    features     = Config.Features,
    sound        = Config.Sound,
    cards        = Config.Cards,
    savingsRates = Config.SavingsRates,
    loans        = Config.Loans,
    accounts     = Config.Accounts,
  }
end
