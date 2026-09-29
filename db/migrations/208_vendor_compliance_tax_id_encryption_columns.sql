-- 208: org_vendor_compliance.tax_id_encrypted was created (migration 204) as a single text
-- column with a name promising encryption but no actual encryption wired up yet. This codebase
-- already has a vetted AES-256-GCM pattern for exactly this kind of sensitive-at-rest field
-- (podCredentialCrypto.js, migration 175) storing ciphertext + iv + authTag as three separate
-- columns rather than packing them into one -- matching that shape here rather than inventing a
-- delimited single-column format.

ALTER TABLE org_vendor_compliance
  ADD COLUMN tax_id_iv text,
  ADD COLUMN tax_id_auth_tag text;

COMMENT ON COLUMN org_vendor_compliance.tax_id_encrypted IS 'AES-256-GCM ciphertext (base64), see server/organizational/lib/vendorTaxIdCrypto.js. Paired with tax_id_iv/tax_id_auth_tag. Uses its own key (VENDOR_TAX_ID_ENCRYPTION_KEY), not the Pod-credential key, so the two blast radii and rotation schedules stay independent.';
