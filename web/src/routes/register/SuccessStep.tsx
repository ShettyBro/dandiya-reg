import { CheckCircle, InstagramLogo } from "@phosphor-icons/react";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { LinkButton } from "../../components/ui/Button.js";

const INSTAGRAM_URL = "https://www.instagram.com/acharya_sahitya?stkn=MW9zem5qeGY0Zm0zag%3D%3D";

export function SuccessStep({ publicCode }: { publicCode: string }) {
  return (
    <GlassPanel variant="solid" className="flex flex-col items-center gap-4 p-8 text-center">
      <CheckCircle size={48} weight="fill" className="text-festival-gold" />
      <h2 className="font-display text-xl font-semibold text-white">Payment proof received</h2>
      <p className="max-w-sm text-sm text-white/70">
        Your registration code is <span className="font-semibold text-festival-gold">{publicCode}</span>.
        Verification is pending.
      </p>
      <p className="max-w-sm text-sm text-white/70">
        You'll receive your{" "}
        <span className="font-semibold text-white">Dandiya Celebration Kit QR on your registered email</span>{" "}
        once your payment is approved — it's also available on the pass page anytime after that. Stay tuned!
      </p>
      <p className="max-w-sm rounded-xl border border-festival-gold/25 bg-festival-gold/8 px-4 py-3 text-sm text-festival-gold">
        Your Dandiya Celebration Kit will be provided at the event venue.
      </p>
      <LinkButton to={`/registration/status?code=${publicCode}`} className="mt-2">
        Check status
      </LinkButton>
      <a
        href={INSTAGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 flex items-center gap-2 text-sm text-white/60 hover:text-festival-gold"
      >
        <InstagramLogo size={20} weight="fill" />
        Follow us @acharya_sahitya
      </a>
    </GlassPanel>
  );
}
