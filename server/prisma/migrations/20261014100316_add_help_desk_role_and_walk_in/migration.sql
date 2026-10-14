-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'HELP_DESK';

-- AlterTable
ALTER TABLE "registrations" ADD COLUMN     "walkIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "walkInApprovedAt" TIMESTAMP(3),
ADD COLUMN     "walkInApprovedById" TEXT;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_walkInApprovedById_fkey" FOREIGN KEY ("walkInApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
