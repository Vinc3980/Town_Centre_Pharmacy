-- AlterTable
ALTER TABLE "medicines" ADD COLUMN     "controlledSubstanceClass" TEXT,
ADD COLUMN     "isControlledSubstance" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "dispensedById" UUID,
ADD COLUMN     "prescriptionReference" TEXT;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_dispensedById_fkey" FOREIGN KEY ("dispensedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: grant the new dispense_controlled_substances permission to existing
-- admins and branch managers (permissions are per-user snapshots in the DB).
UPDATE "users"
SET permissions = array_append(permissions, 'dispense_controlled_substances')
WHERE role::text IN ('admin', 'branch_manager')
  AND NOT ('dispense_controlled_substances' = ANY(permissions));
