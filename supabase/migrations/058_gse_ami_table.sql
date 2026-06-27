-- 058: GSE/FHFA Area Median Income table
-- Source: Freddie Mac MFI raw file (same FHFA AMI used by Fannie Mae HomeReady)
-- Populated by tools/etl-gse-ami.mjs — run annually when new AMI data is published

CREATE TABLE IF NOT EXISTS gse_ami (
  county_fips  text PRIMARY KEY,
  ami_fhfa     integer NOT NULL,
  fiscal_year  smallint NOT NULL DEFAULT 2026,
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gse_ami_fips_idx ON gse_ami (county_fips);
