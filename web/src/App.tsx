import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { LandingPage } from "./routes/landing-page.js";
import { RegisterPage } from "./routes/register-page.js";
import { StatusPage } from "./routes/status-page.js";
import { PassPage } from "./routes/pass-page.js";
import { TermsPage } from "./routes/terms-page.js";

const VolunteerLoginPage = lazy(() =>
  import("./routes/volunteer/VolunteerLoginPage.js").then((m) => ({ default: m.VolunteerLoginPage }))
);
const VolunteerLayout = lazy(() =>
  import("./routes/volunteer/VolunteerLayout.js").then((m) => ({ default: m.VolunteerLayout }))
);
const VolunteerHomePage = lazy(() =>
  import("./routes/volunteer/VolunteerHomePage.js").then((m) => ({ default: m.VolunteerHomePage }))
);
const VolunteerScanPage = lazy(() =>
  import("./routes/volunteer/VolunteerScanPage.js").then((m) => ({ default: m.VolunteerScanPage }))
);
const VolunteerChangePasswordPage = lazy(() =>
  import("./routes/volunteer/VolunteerChangePasswordPage.js").then((m) => ({
    default: m.VolunteerChangePasswordPage
  }))
);

const AdminLoginPage = lazy(() =>
  import("./routes/admin/AdminLoginPage.js").then((m) => ({ default: m.AdminLoginPage }))
);
const AdminLayout = lazy(() =>
  import("./routes/admin/AdminLayout.js").then((m) => ({ default: m.AdminLayout }))
);
const AdminDashboardPage = lazy(() =>
  import("./routes/admin/AdminDashboardPage.js").then((m) => ({ default: m.AdminDashboardPage }))
);
const AdminVolunteersPage = lazy(() =>
  import("./routes/admin/AdminVolunteersPage.js").then((m) => ({ default: m.AdminVolunteersPage }))
);
const AdminRegistrationsPage = lazy(() =>
  import("./routes/admin/AdminRegistrationsPage.js").then((m) => ({ default: m.AdminRegistrationsPage }))
);
const AdminPaymentsPage = lazy(() =>
  import("./routes/admin/AdminPaymentsPage.js").then((m) => ({ default: m.AdminPaymentsPage }))
);
const AdminSettingsPage = lazy(() =>
  import("./routes/admin/AdminSettingsPage.js").then((m) => ({ default: m.AdminSettingsPage }))
);
const AdminLogsPage = lazy(() =>
  import("./routes/admin/AdminLogsPage.js").then((m) => ({ default: m.AdminLogsPage }))
);
const AdminIdentityPage = lazy(() =>
  import("./routes/admin/AdminIdentityPage.js").then((m) => ({ default: m.AdminIdentityPage }))
);

const FinanceLoginPage = lazy(() =>
  import("./routes/finance/FinanceLoginPage.js").then((m) => ({ default: m.FinanceLoginPage }))
);
const FinanceLayout = lazy(() =>
  import("./routes/finance/FinanceLayout.js").then((m) => ({ default: m.FinanceLayout }))
);
const FinanceDashboardPage = lazy(() =>
  import("./routes/finance/FinanceDashboardPage.js").then((m) => ({ default: m.FinanceDashboardPage }))
);
const FinancePaymentsPage = lazy(() =>
  import("./routes/finance/FinancePaymentsPage.js").then((m) => ({ default: m.FinancePaymentsPage }))
);
const FinanceIdentityPage = lazy(() =>
  import("./routes/finance/FinanceIdentityPage.js").then((m) => ({ default: m.FinanceIdentityPage }))
);

function VolunteerFallback() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-midnight-950 text-white/50">Loading...</div>;
}

export function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/registration/status" element={<StatusPage />} />
        <Route path="/registration/pass" element={<PassPage />} />
        <Route path="/terms" element={<TermsPage />} />

        <Route
          path="/vol/login"
          element={
            <Suspense fallback={<VolunteerFallback />}>
              <VolunteerLoginPage />
            </Suspense>
          }
        />
        <Route
          element={
            <Suspense fallback={<VolunteerFallback />}>
              <VolunteerLayout />
            </Suspense>
          }
        >
          <Route path="/vol/home" element={<VolunteerHomePage />} />
          <Route path="/vol/scan" element={<VolunteerScanPage />} />
          <Route path="/vol/change-password" element={<VolunteerChangePasswordPage />} />
        </Route>

        <Route
          path="/ad-login"
          element={
            <Suspense fallback={<VolunteerFallback />}>
              <AdminLoginPage />
            </Suspense>
          }
        />
        <Route
          element={
            <Suspense fallback={<VolunteerFallback />}>
              <AdminLayout />
            </Suspense>
          }
        >
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="/admin/registrations" element={<AdminRegistrationsPage />} />
          <Route path="/admin/volunteers" element={<AdminVolunteersPage />} />
          <Route path="/admin/payments" element={<AdminPaymentsPage />} />
          <Route path="/admin/identity" element={<AdminIdentityPage />} />
          <Route path="/admin/logs" element={<AdminLogsPage />} />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />
        </Route>

        <Route
          path="/fin-login"
          element={
            <Suspense fallback={<VolunteerFallback />}>
              <FinanceLoginPage />
            </Suspense>
          }
        />
        <Route
          element={
            <Suspense fallback={<VolunteerFallback />}>
              <FinanceLayout />
            </Suspense>
          }
        >
          <Route path="/finance/dashboard" element={<FinanceDashboardPage />} />
          <Route path="/finance/payments" element={<FinancePaymentsPage />} />
          <Route path="/finance/identity" element={<FinanceIdentityPage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
