import { StaffLoginPage } from "../staff/StaffLoginPage.js";

export function VerifyLoginPage() {
  return (
    <StaffLoginPage
      title="ID Verification sign in"
      subtitle="Dandiya Night 2026 identity verification panel"
      allowedRoles={["ID_VERIFIER"]}
      redirectTo="/verify/dashboard"
    />
  );
}
