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

export function useEventConfig() {
  const [config, setConfig] = useState<EventConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiRequest<EventConfig>("/event/config")
      .then((data) => {
        if (!cancelled) {
          setConfig(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load event details right now.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
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
