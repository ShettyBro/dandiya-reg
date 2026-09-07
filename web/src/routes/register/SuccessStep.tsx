import { CheckCircle } from "@phosphor-icons/react";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { LinkButton } from "../../components/ui/Button.js";

export function SuccessStep({ publicCode }: { publicCode: string }) {
  return (
    <GlassPanel variant="solid" className="flex flex-col items-center gap-4 p-8 text-center">
      <CheckCircle size={48} weight="fill" className="text-festival-gold" />
      <h2 className="font-display text-xl font-semibold text-white">Payment proof received</h2>
      <p className="max-w-sm text-sm text-white/70">
        Your registration code is <span className="font-semibold text-festival-gold">{publicCode}</span>.
        Verification is pending. You'll get an email once it's approved, and your digital pass will be
        available on the pass page.
      </p>
      <LinkButton to={`/registration/status?code=${publicCode}`} className="mt-2">
        Check status
      </LinkButton>
    </GlassPanel>
  );
}
