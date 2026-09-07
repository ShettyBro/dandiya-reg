import { useEffect, useState } from "react";
import { apiRequest } from "../api.js";

export interface EventConfig {
  eventId: string;
  name: string;
  eventDate: string;
  venue: string;
  registrationOpen: boolean;
  capacity: number;
  remainingCapacity: number;
  priceInPaise: number;
  erpPaymentUrl: string;
  paymentInstructions: string;
}

const RETRY_INTERVAL_MS = 20000;

export function useEventConfig() {
  const [config, setConfig] = useState<EventConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;

    function load() {
      apiRequest<EventConfig>("/event/config")
        .then((data) => {
          if (cancelled) return;
          setConfig(data);
          setError(null);
        })
        .catch(() => {
          if (cancelled) return;
          setError("Could not load event details right now.");
          retryTimer = window.setTimeout(load, RETRY_INTERVAL_MS);
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
      window.clearTimeout(retryTimer);
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
