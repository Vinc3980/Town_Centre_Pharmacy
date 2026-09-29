-- CreateTable
CREATE TABLE "legacy_orphans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "collection" TEXT NOT NULL,
    "legacyId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "doc" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_orphans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legacy_orphans_collection_idx" ON "legacy_orphans"("collection");
