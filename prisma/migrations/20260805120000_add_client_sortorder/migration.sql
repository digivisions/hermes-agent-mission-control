-- AlterTable
ALTER TABLE "Client" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Client_sortOrder_idx" ON "Client"("sortOrder");
