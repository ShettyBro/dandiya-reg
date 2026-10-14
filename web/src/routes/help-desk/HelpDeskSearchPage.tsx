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

interface ErpSearchResult {
  id: string;
  name: string;
  phone: string;
  email: string;
  paymentId: string;
  transactionDate: string;
  amountInPaise: number;
  remarks: string | null;
  matchedRegistration: { name: string; status: string; publicCode: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  PAYMENT_PENDING: "Payment pending",
  IDENTITY_PENDING: "Identity pending",
  IDENTITY_REJECTED: "Identity rejected",
  PAYMENT_SUBMITTED: "Payment submitted",
  PAYMENT_APPROVED: "Approved",
  PAYMENT_REJECTED: "Payment rejected"
};

const TABS = [
  { key: "registrations", label: "Registrations" },
  { key: "erp", label: "ERP Transactions" }
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function HelpDeskSearchPage() {
  const [tab, setTab] = useState<TabKey>("registrations");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-white sm:text-2xl">Find a person</h1>
        <p className="mt-1 text-sm text-white/60">
          Search the website's registrations, or verify an ERP payment directly.
        </p>
      </div>

      <div className="flex gap-2 rounded-pill border border-white/10 bg-white/5 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-pill px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? "bg-festival-gold text-midnight-950" : "text-white/60 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "registrations" ? <RegistrationSearchTab /> : <ErpTransactionSearchTab />}
    </div>
  );
}

function RegistrationSearchTab() {
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
    <div className="flex flex-col gap-6">
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

function ErpTransactionSearchTab() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ErpSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    setSearching(true);
    setSearchError(null);
    try {
      const response = await apiRequest<{ items: ErpSearchResult[] }>(`/help-desk/erp-search?q=${encodeURIComponent(query.trim())}`);
      setResults(response.items);
    } catch (error) {
      setSearchError(error instanceof ApiError ? error.message : "Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <GlassPanel className="p-5">
        <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <FormField
              label="Search ERP payments"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Transaction ID, phone, name, or email"
            />
          </div>
          <Button type="submit" disabled={searching || query.trim().length === 0}>
            {searching ? "Searching..." : "Search"}
          </Button>
        </form>
        {searchError && <p className="mt-3 text-sm text-red-300">{searchError}</p>}
      </GlassPanel>

      {results && results.length === 0 && !searching && (
        <p className="text-sm text-white/50">No matching ERP payment found.</p>
      )}

      {results && results.length > 0 && (
        <div className="flex flex-col gap-3">
          {results.map((r) => (
            <GlassPanel key={r.id} variant="solid" className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium capitalize text-white">{r.name}</p>
                  <p className="mt-0.5 text-xs text-white/50">
                    {r.phone} &middot; {r.email}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-white/40">&#8377;{(r.amountInPaise / 100).toFixed(0)}</p>
              </div>
              <p className="mt-2 font-mono text-[11px] text-white/35">
                {r.paymentId} &middot; {new Date(r.transactionDate).toLocaleString()}
              </p>

              {r.matchedRegistration ? (
                <div className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-400/8 px-3 py-2">
                  <p className="text-xs text-emerald-300">
                    Already registered as <span className="font-semibold capitalize">{r.matchedRegistration.name}</span>{" "}
                    ({r.matchedRegistration.publicCode}) &middot; {STATUS_LABELS[r.matchedRegistration.status] ?? r.matchedRegistration.status}
                  </p>
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/8 px-3 py-2">
                  <p className="text-xs text-amber-300">
                    Not registered yet &mdash; use <span className="font-mono">/emg</span> to register them and hand over the QR.
                  </p>
                </div>
              )}
            </GlassPanel>
          ))}
        </div>
      )}
    </div>
  );
}
