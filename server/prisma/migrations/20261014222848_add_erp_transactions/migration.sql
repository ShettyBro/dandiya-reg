-- CreateTable
CREATE TABLE "erp_transactions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "amountInPaise" INTEGER NOT NULL,
    "remarks" TEXT,
    "school" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "erp_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "erp_transactions_paymentId_key" ON "erp_transactions"("paymentId");

-- CreateIndex
CREATE INDEX "erp_transactions_phone_idx" ON "erp_transactions"("phone");

-- CreateIndex
CREATE INDEX "erp_transactions_email_idx" ON "erp_transactions"("email");

-- CreateIndex
CREATE INDEX "erp_transactions_name_idx" ON "erp_transactions"("name");
