-- LWK Bank - run once on your server database (the resource also creates these on start).
-- All timestamps are unix milliseconds.

CREATE TABLE IF NOT EXISTS `lwk_bank_accounts` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `iban`       VARCHAR(16)  NOT NULL,
  `type`       VARCHAR(16)  NOT NULL,              -- personal | shared | business
  `name`       VARCHAR(48)  NOT NULL,
  `owner`      VARCHAR(64)  NOT NULL,              -- citizenid / identifier, or job name for business
  `is_default` TINYINT(1)   NOT NULL DEFAULT 0,    -- the player's main account = framework bank money
  `balance`    BIGINT       NOT NULL DEFAULT 0,    -- unused for the default account
  `savings`    BIGINT       NOT NULL DEFAULT 0,
  `created_at` BIGINT       NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `iban` (`iban`),
  KEY `owner` (`owner`)
);

CREATE TABLE IF NOT EXISTS `lwk_bank_members` (
  `account_id` INT UNSIGNED NOT NULL,
  `identifier` VARCHAR(64)  NOT NULL,
  `name`       VARCHAR(64)  NOT NULL,
  `perms`      VARCHAR(255) NOT NULL DEFAULT '{}',
  PRIMARY KEY (`account_id`, `identifier`),
  KEY `identifier` (`identifier`)
);

CREATE TABLE IF NOT EXISTS `lwk_bank_transactions` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `account_id`   INT UNSIGNED NOT NULL,
  `type`         VARCHAR(16)  NOT NULL,
  `amount`       BIGINT       NOT NULL,
  `label`        VARCHAR(64)  NOT NULL,
  `counterparty` VARCHAR(64)  NULL,
  `pot`          VARCHAR(16)  NULL,
  `created_at`   BIGINT       NOT NULL,
  PRIMARY KEY (`id`),
  KEY `account_time` (`account_id`, `created_at`)
);

CREATE TABLE IF NOT EXISTS `lwk_bank_contacts` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `identifier` VARCHAR(64)  NOT NULL,
  `name`       VARCHAR(32)  NOT NULL,
  `iban`       VARCHAR(16)  NOT NULL,
  PRIMARY KEY (`id`),
  KEY `identifier` (`identifier`)
);
