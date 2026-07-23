-- 073_obmmi_ltv_min.sql
-- AD-11 Seam 3a: adds the LTV floor column market_data_series was missing.
-- 072's segmentation metadata only had ltv_max (a ceiling), which was enough
-- for standalone series (none were LTV-segmented). OBMMI's LTV split is
-- two-sided ("<=80" vs ">80"), and expressing the ">80" segment needs a
-- floor, not just a max -- this column closes that gap before OBMMI series
-- are added to the registry.

alter table market_data_series add column if not exists ltv_min numeric;
