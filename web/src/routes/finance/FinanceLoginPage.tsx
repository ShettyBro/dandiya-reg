import { StaffLoginPage } from "../staff/StaffLoginPage.js";

export function FinanceLoginPage() {
  return (
    <StaffLoginPage
      title="Finance sign in"
      subtitle="Dandiya Night 2026 finance panel"
      allowedRoles={["FINANCE"]}
      redirectTo="/finance/dashboard"
    />
  );
}
