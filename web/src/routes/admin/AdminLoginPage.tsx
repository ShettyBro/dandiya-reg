import { StaffLoginPage } from "../staff/StaffLoginPage.js";

export function AdminLoginPage() {
  return (
    <StaffLoginPage
      title="Admin sign in"
      subtitle="Dandiya Night 2026 admin panel"
      allowedRoles={["ADMIN"]}
      redirectTo="/admin/dashboard"
    />
  );
}
