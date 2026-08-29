import { useEffect, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { CameraRotate, Flashlight, QrCode, Warning } from "@phosphor-icons/react";
import { Container } from "../../components/ui/Container.js";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { Button } from "../../components/ui/Button.js";
import { apiRequest, ApiError } from "../../lib/api.js";
import type { AuthUser } from "../../lib/hooks/useAuth.js";

const SCANNER_ELEMENT_ID = "volunteer-qr-reader";

interface ScanLookupResult {
  credentialType: "PARTICIPANT" | "STAFF_GUEST_ADMIN";
  registrationId: string | null;
  name: string | null;
  publicCode: string | null;
  attendanceState: "NOT_ENTERED" | "ENTERED" | "OVERRIDE_ENTRY" | null;
  eligibleForAllow: boolean;
  eligibleForOverride: boolean;
  photoUrl: string | null;
}

type ResultState =
  | { kind: "lookup"; data: ScanLookupResult }
  | { kind: "allowed"; label: string }
  | { kind: "overridden"; label: string }
  | { kind: "blocked"; message: string }
  | { kind: "not-found" }
  | { kind: "session-expired" };

export function VolunteerScanPage() {
  const { user } = useOutletContext<{ user: AuthUser }>();
  const navigate = useNavigate();
  const [cameraStarted, setCameraStarted] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const pendingTokenRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    return () => {
      scannerRef.current?.stop().catch(() => undefined);
    };
  }, []);

  async function startCamera() {
    setCameraError(null);
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => handleDecoded(decodedText),
        () => undefined
      );
      setCameraStarted(true);

      const capabilities = scanner.getRunningTrackCapabilities?.();
      setTorchSupported(Boolean((capabilities as { torch?: boolean })?.torch));
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setCameraError("Camera permission was denied. Allow camera access in your browser settings and retry.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setCameraError("No camera was found on this device.");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setCameraError("The camera is already in use by another app. Close it and retry.");
      } else {
        setCameraError("Could not start the camera. Retry, or use a different device.");
      }
    }
  }

  async function toggleTorch() {
    if (!scannerRef.current) {
      return;
    }
    try {
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: !torchOn } as unknown as MediaTrackConstraintSet]
      });
      setTorchOn((value) => !value);
    } catch {
      setTorchSupported(false);
    }
  }

  async function handleDecoded(token: string) {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    pendingTokenRef.current = token;
    setProcessing(true);
    setResult(null);
    setOverrideReason("");

    try {
      const lookup = await apiRequest<ScanLookupResult>("/scan/lookup", {
        method: "POST",
        body: { token }
      });
      setResult({ kind: "lookup", data: lookup });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setResult({ kind: "session-expired" });
      } else if (error instanceof ApiError && error.code === "CREDENTIAL_NOT_FOUND") {
        setResult({ kind: "not-found" });
      } else {
        setResult({ kind: "blocked", message: "Could not check this code. Try again." });
      }
    } finally {
      setProcessing(false);
    }
  }

  async function handleAllow() {
    const token = pendingTokenRef.current;
    if (!token) {
      return;
    }
    setProcessing(true);
    try {
      const response = await apiRequest<{ type: string; name?: string; label?: string }>("/scan/allow", {
        method: "POST",
        body: { token }
      });
      setResult({ kind: "allowed", label: response.name ?? response.label ?? "Entry allowed" });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setResult({ kind: "session-expired" });
      } else if (error instanceof ApiError && error.code === "ALREADY_ENTERED") {
        setResult({ kind: "blocked", message: "Someone already scanned this a moment ago." });
      } else {
        setResult({ kind: "blocked", message: "Could not allow entry. Try again." });
      }
    } finally {
      setProcessing(false);
    }
  }

  async function handleOverride() {
    const token = pendingTokenRef.current;
    if (!token || overrideReason.trim().length < 5) {
      return;
    }
    setProcessing(true);
    try {
      const response = await apiRequest<{ name: string }>("/scan/override", {
        method: "POST",
        body: { token, reason: overrideReason.trim() }
      });
      setResult({ kind: "overridden", label: response.name });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setResult({ kind: "session-expired" });
      } else {
        setResult({ kind: "blocked", message: "Override failed. Try again." });
      }
    } finally {
      setProcessing(false);
    }
  }

  function scanNext() {
    setResult(null);
    setOverrideReason("");
    pendingTokenRef.current = null;
    inFlightRef.current = false;
  }

  return (
    <Container className="max-w-md py-10">
      <h1 className="mb-6 font-display text-2xl font-semibold text-white">Scan</h1>

      {!cameraStarted && !result && (
        <GlassPanel className="flex flex-col items-center gap-4 p-8 text-center">
          <QrCode size={40} className="text-festival-gold" />
          <p className="text-sm text-white/70">
            We'll ask for camera access to scan participant and staff QR codes.
          </p>
          <Button type="button" onClick={startCamera}>
            Start scanning
          </Button>
          {cameraError && (
            <p className="flex items-center gap-2 text-sm text-red-300">
              <Warning size={16} /> {cameraError}
            </p>
          )}
        </GlassPanel>
      )}

      <div className={cameraStarted && !result ? "block" : "hidden"}>
        <GlassPanel className="overflow-hidden p-2">
          <div id={SCANNER_ELEMENT_ID} className="overflow-hidden rounded-2xl" />
        </GlassPanel>
        {torchSupported && (
          <button
            type="button"
            onClick={toggleTorch}
            className="mx-auto mt-4 flex items-center gap-2 rounded-pill border border-white/20 px-4 py-2 text-sm text-white/80"
          >
            <Flashlight size={16} weight={torchOn ? "fill" : "regular"} />
            {torchOn ? "Turn off flash" : "Turn on flash"}
          </button>
        )}
        {processing && <p className="mt-4 text-center text-sm text-white/50">Checking...</p>}
      </div>

      {result && (
        <ScanResultPanel
          result={result}
          processing={processing}
          isTeamLeader={user.role === "TEAM_LEADER"}
          overrideReason={overrideReason}
          onOverrideReasonChange={setOverrideReason}
          onAllow={handleAllow}
          onOverride={handleOverride}
          onNext={scanNext}
          onSignInAgain={() => navigate("/volunteer/login", { replace: true })}
        />
      )}
    </Container>
  );
}

function ScanResultPanel({
  result,
  processing,
  isTeamLeader,
  overrideReason,
  onOverrideReasonChange,
  onAllow,
  onOverride,
  onNext,
  onSignInAgain
}: {
  result: ResultState;
  processing: boolean;
  isTeamLeader: boolean;
  overrideReason: string;
  onOverrideReasonChange: (value: string) => void;
  onAllow: () => void;
  onOverride: () => void;
  onNext: () => void;
  onSignInAgain: () => void;
}) {
  if (result.kind === "session-expired") {
    return (
      <GlassPanel className="flex flex-col items-center gap-4 border-amber-400/40 p-8 text-center">
        <Warning size={36} className="text-amber-300" />
        <p className="font-display text-lg font-semibold text-amber-300">Your session expired</p>
        <p className="text-sm text-white/60">Sign in again to keep scanning.</p>
        <Button type="button" onClick={onSignInAgain}>
          Sign in again
        </Button>
      </GlassPanel>
    );
  }

  if (result.kind === "not-found") {
    return (
      <GlassPanel className="flex flex-col items-center gap-4 border-red-400/40 p-8 text-center">
        <CameraRotate size={36} className="text-red-300" />
        <p className="font-display text-lg font-semibold text-red-300">Invalid QR code</p>
        <Button type="button" variant="secondary" onClick={onNext}>
          Scan next
        </Button>
      </GlassPanel>
    );
  }

  if (result.kind === "blocked") {
    return (
      <GlassPanel className="flex flex-col items-center gap-4 p-8 text-center">
        <p className="font-display text-lg font-semibold text-amber-300">{result.message}</p>
        <Button type="button" variant="secondary" onClick={onNext}>
          Scan next
        </Button>
      </GlassPanel>
    );
  }

  if (result.kind === "allowed" || result.kind === "overridden") {
    return (
      <GlassPanel className="flex flex-col items-center gap-4 border-emerald-400/40 p-8 text-center">
        <p className="text-xs uppercase tracking-[0.12em] text-emerald-300">
          {result.kind === "overridden" ? "Override entry granted" : "Entry allowed"}
        </p>
        <p className="font-display text-xl font-semibold text-white">{result.label}</p>
        <Button type="button" onClick={onNext}>
          Scan next
        </Button>
      </GlassPanel>
    );
  }

  const { data } = result;

  return (
    <GlassPanel className="flex flex-col items-center gap-4 p-8 text-center">
      {data.photoUrl && (
        <img
          src={data.photoUrl}
          alt={data.name ?? ""}
          className="h-24 w-24 rounded-full border-2 border-white/20 object-cover"
        />
      )}
      <p className="font-display text-xl font-semibold text-white">
        {data.name ?? "Staff / Guest"}
      </p>
      {data.publicCode && <p className="text-xs text-white/50">{data.publicCode}</p>}

      {data.credentialType === "STAFF_GUEST_ADMIN" && (
        <>
          <p className="text-sm text-indigo-300">Unrestricted staff credential</p>
          <Button type="button" onClick={onAllow} disabled={processing}>
            {processing ? "Working..." : "Allow entry"}
          </Button>
        </>
      )}

      {data.credentialType === "PARTICIPANT" && data.eligibleForAllow && (
        <>
          <p className="text-sm text-emerald-300">Ready to enter</p>
          <Button type="button" onClick={onAllow} disabled={processing}>
            {processing ? "Working..." : "Allow entry"}
          </Button>
        </>
      )}

      {data.credentialType === "PARTICIPANT" && !data.eligibleForAllow && (
        <>
          <p className="text-sm text-amber-300">Already entered</p>
          {isTeamLeader ? (
            <div className="flex w-full flex-col gap-3">
              <textarea
                value={overrideReason}
                onChange={(e) => onOverrideReasonChange(e.target.value)}
                placeholder="Reason for override (required)"
                rows={2}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
              />
              <Button
                type="button"
                onClick={onOverride}
                disabled={processing || overrideReason.trim().length < 5}
              >
                {processing ? "Working..." : "Override and allow"}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-white/50">Ask a Team Leader if this needs an override.</p>
          )}
        </>
      )}

      <button type="button" onClick={onNext} className="text-xs text-white/40 underline">
        Scan next instead
      </button>
    </GlassPanel>
  );
}
