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
          path="/volunteer/login"
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
          <Route path="/volunteer/home" element={<VolunteerHomePage />} />
          <Route path="/volunteer/scan" element={<VolunteerScanPage />} />
          <Route path="/volunteer/change-password" element={<VolunteerChangePasswordPage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
