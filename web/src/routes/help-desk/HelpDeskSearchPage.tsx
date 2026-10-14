import { useState, type FormEvent } from "react";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { FormField } from "../../components/ui/FormField.js";
import { Button } from "../../components/ui/Button.js";
import { apiRequest, ApiError } from "../../lib/api.js";

interface SearchResult {
  id: string;
  name: string;
  phone: string;
  email: string;
  registrationType: string;
  status: string;
  publicCode: string;
  createdAt: string;
}

interface RegistrationDetail {
  id: string;
  name: string;
  phone: string;
  email: string;
  registrationType: string;
  status: string;
  publicCode: string;
  photoUrl: string | null;
  qrDataUrl: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  PAYMENT_PENDING: "Payment pending",
  IDENTITY_PENDING: "Identity pending",
  IDENTITY_REJECTED: "Identity rejected",
  PAYMENT_SUBMITTED: "Payment submitted",
  PAYMENT_APPROVED: "Approved",
  PAYMENT_REJECTED: "Payment rejected"
};

export function HelpDeskSearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [detail, setDetail] = useState<RegistrationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    setSearching(true);
    setSearchError(null);
    setDetail(null);
    try {
      const response = await apiRequest<{ items: SearchResult[] }>(`/help-desk/search?q=${encodeURIComponent(query.trim())}`);
      setResults(response.items);
    } catch (error) {
      setSearchError(error instanceof ApiError ? error.message : "Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  async function handleSelect(id: string) {
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      const response = await apiRequest<RegistrationDetail>(`/help-desk/registrations/${id}`);
      setDetail(response);
    } catch (error) {
      setDetailError(error instanceof ApiError ? error.message : "Could not load this registration.");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-white sm:text-2xl">Search registrations</h1>
        <p className="mt-1 text-sm text-white/60">Look up by name, phone, email, registration code, or AUID.</p>
      </div>

      <GlassPanel className="p-5">
        <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <FormField label="Search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. 9876543210 or DN26-ABCD12" />
          </div>
          <Button type="submit" disabled={searching || query.trim().length === 0}>
            {searching ? "Searching..." : "Search"}
          </Button>
        </form>
        {searchError && <p className="mt-3 text-sm text-red-300">{searchError}</p>}
      </GlassPanel>

      {results && results.length === 0 && !searching && (
        <p className="text-sm text-white/50">No matches found.</p>
      )}

      {results && results.length > 0 && (
        <GlassPanel className="divide-y divide-white/10 p-0">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => handleSelect(r.id)}
              className="flex w-full flex-col gap-0.5 px-5 py-3 text-left transition-colors hover:bg-white/5"
            >
              <span className="text-sm font-medium capitalize text-white">{r.name}</span>
              <span className="text-xs text-white/50">
                {r.phone} &middot; {r.email} &middot; {r.publicCode} &middot; {STATUS_LABELS[r.status] ?? r.status}
              </span>
            </button>
          ))}
        </GlassPanel>
      )}

      {detailLoading && <p className="text-sm text-white/50">Loading...</p>}
      {detailError && <p className="text-sm text-red-300">{detailError}</p>}

      {detail && (
        <GlassPanel variant="solid" className="flex flex-col items-center gap-4 p-6 text-center sm:p-8">
          {detail.photoUrl && (
            <img src={detail.photoUrl} alt={detail.name} className="h-24 w-24 rounded-full object-cover" />
          )}
          <div>
            <p className="font-display text-lg font-semibold capitalize text-white">{detail.name}</p>
            <p className="mt-1 font-mono text-xs tracking-widest text-white/40">{detail.publicCode}</p>
          </div>
          <div className="flex flex-col gap-1 text-sm text-white/70">
            <p>{detail.phone}</p>
            <p>{detail.email}</p>
            <p className="text-white/50">{STATUS_LABELS[detail.status] ?? detail.status}</p>
          </div>

          {detail.qrDataUrl ? (
            <img src={detail.qrDataUrl} alt="QR code" className="h-56 w-56 rounded-xl border border-white/10 bg-white p-2" />
          ) : (
            <p className="rounded-xl border border-amber-400/25 bg-amber-400/8 px-4 py-3 text-sm text-amber-300">
              No QR code available yet (status: {STATUS_LABELS[detail.status] ?? detail.status}).
            </p>
          )}
        </GlassPanel>
      )}
    </div>
  );
}
