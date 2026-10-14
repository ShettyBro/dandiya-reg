import { StaffLoginPage } from "../staff/StaffLoginPage.js";

export function HelpDeskLoginPage() {
  return (
    <StaffLoginPage
      title="Help Desk sign in"
      subtitle="Dandiya Night 2026 help desk panel"
      allowedRoles={["HELP_DESK", "ADMIN"]}
      redirectTo="/help/search"
    />
  );
}
