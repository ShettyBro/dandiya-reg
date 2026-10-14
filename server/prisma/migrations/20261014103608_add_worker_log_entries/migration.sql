-- CreateTable
CREATE TABLE "worker_log_entries" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "worker_log_entries_createdAt_idx" ON "worker_log_entries"("createdAt");
