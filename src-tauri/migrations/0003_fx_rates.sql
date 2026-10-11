CREATE TABLE fx_rates (
  source    TEXT NOT NULL CHECK (source IN ('tcmb', 'ecb')),
  rate_date TEXT NOT NULL,
  currency  TEXT NOT NULL,
  rate      REAL NOT NULL CHECK (rate > 0),
  PRIMARY KEY (source, rate_date, currency)
);
