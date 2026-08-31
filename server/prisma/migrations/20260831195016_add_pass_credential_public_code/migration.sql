-- AlterTable
ALTER TABLE "pass_credentials" ADD COLUMN "publicCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "pass_credentials_publicCode_key" ON "pass_credentials"("publicCode");
