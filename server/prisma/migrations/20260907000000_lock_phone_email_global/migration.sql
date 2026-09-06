DROP INDEX "registrations_phone_type_active_key";

CREATE UNIQUE INDEX "registrations_phone_active_key" ON "registrations"("phone")
  WHERE "status" NOT IN ('PAYMENT_REJECTED', 'IDENTITY_REJECTED');

CREATE UNIQUE INDEX "registrations_email_active_key" ON "registrations"("email")
  WHERE "status" NOT IN ('PAYMENT_REJECTED', 'IDENTITY_REJECTED');
