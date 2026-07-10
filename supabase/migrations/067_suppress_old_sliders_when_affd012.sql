-- Migration 067: Null out old purchase slider cards in stored messages where AFFD-012 is present
-- Pattern: two-layer fix (frontend guard already deployed + this DB migration for historical messages)
-- When affordabilityPurchaseCard is non-null in a stored message, the old convHBSlider / fhaSlider /
-- vaSlider / jumboSlider / incomeQualifySlider fields must be null so only AFFD-012 renders.

UPDATE chat_threads
SET messages = (
  SELECT jsonb_agg(
    CASE
      WHEN
        (elem->'meta'->'affordabilityPurchaseCard') IS NOT NULL
        AND elem->'meta'->>'affordabilityPurchaseCard' != 'null'
      THEN
        elem
          #- '{meta,convHBSlider}'         -- remove (jsonb_set to null leaves the key; #- removes it cleanly)
        || jsonb_build_object(
             'meta', (elem->'meta')
               || jsonb_build_object(
                    'convHBSlider',       'null'::jsonb,
                    'fhaSlider',          'null'::jsonb,
                    'vaSlider',           'null'::jsonb,
                    'jumboSlider',        'null'::jsonb,
                    'incomeQualifySlider','null'::jsonb
                  )
           )
      ELSE elem
    END
  )
  FROM jsonb_array_elements(messages) AS elem
)
WHERE
  messages IS NOT NULL
  AND jsonb_typeof(messages) = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(messages) AS elem
    WHERE
      (elem->'meta'->'affordabilityPurchaseCard') IS NOT NULL
      AND elem->'meta'->>'affordabilityPurchaseCard' != 'null'
  );
