-- Rebrand: Adom Pharmacy -> Town Centre Pharmacy

-- 1) Receipt footer: default for new rows + update existing rows
ALTER TABLE "pharmacy_settings" ALTER COLUMN "receiptFooter" SET DEFAULT 'Thank you for choosing Town Centre Pharmacy';

UPDATE "pharmacy_settings"
SET "receiptFooter" = 'Thank you for choosing Town Centre Pharmacy'
WHERE "receiptFooter" = 'Thank you for choosing Adom Pharmacy';

-- 2) Pharmacy row: name + registration number (only rows still carrying the old brand)
UPDATE "pharmacies"
SET "name" = 'Town Centre Pharmacy', "registrationNumber" = 'TCP-001'
WHERE "registrationNumber" = 'ADOM-001' OR "name" IN ('Adom Pharmacy', 'Tow Centre Pharmacy');

-- 3) User login emails
UPDATE "users"
SET "email" = REPLACE("email", '@adompharmacy.gh', '@towncentrepharmacy.gh')
WHERE "email" LIKE '%@adompharmacy.gh';
