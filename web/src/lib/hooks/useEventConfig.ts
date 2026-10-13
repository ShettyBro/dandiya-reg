import { useEffect, useState } from "react";
import { apiRequest } from "../api.js";

export interface EventConfig {
  eventId: string;
  name: string;
  eventDate: string;
  venue: string;
  registrationOpen: boolean;
  nonAcharyanRegistrationOpen: boolean;
  acharyaStudentRegistrationOpen: boolean;
  acharyaFacultyRegistrationOpen: boolean;
  acharyaAlumniRegistrationOpen: boolean;
  registrationDeadline: string | null;
  priceInPaise: number;
  erpPaymentUrl: string;
  paymentInstructions: string;
  attendanceEnabled: boolean;
}

const RETRY_INTERVAL_MS = 20000;
// A tab left open across an admin flipping registration open/closed must catch up within a
// reasonable time on its own -- this used to fetch exactly once per page load with no recheck,
// so an already-open landing page kept showing "Join the Celebration" indefinitely after an
// admin closed registration elsewhere, until the visitor happened to reload.
const REFRESH_INTERVAL_MS = 30000;

export function useEventConfig() {
  const [config, setConfig] = useState<EventConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    function load() {
      apiRequest<EventConfig>("/event/config")
        .then((data) => {
          if (cancelled) return;
          setConfig(data);
          setError(null);
          timer = window.setTimeout(load, REFRESH_INTERVAL_MS);
        })
        .catch(() => {
          if (cancelled) return;
          setError("Could not load event details right now.");
          timer = window.setTimeout(load, RETRY_INTERVAL_MS);
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }

    load();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return { config, loading, error };
}

export function formatPriceInPaise(priceInPaise: number): string {
  return `₹${(priceInPaise / 100).toLocaleString("en-IN")}`;
}

export function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
