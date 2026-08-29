import { motion } from "motion/react";
import { Sparkle } from "@phosphor-icons/react";
import { Container } from "../../components/ui/Container.js";
import { LinkButton } from "../../components/ui/Button.js";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { formatEventDate, useEventConfig } from "../../lib/hooks/useEventConfig.js";

export function Hero() {
  const { config } = useEventConfig();

  return (
    <section className="relative flex min-h-[100dvh] items-center pt-16">
      <Container className="relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <GlassPanel className="mx-auto max-w-2xl border-transparent bg-midnight-950/20 px-5 py-10 text-center shadow-[0_8px_60px_-12px_rgba(0,0,0,0.6)] sm:px-12 sm:py-14">
            <div className="mx-auto mb-5 flex w-fit items-center gap-2 rounded-pill border border-festival-gold/30 bg-festival-gold/10 px-4 py-1.5 text-xs text-festival-gold">
              <Sparkle size={14} weight="fill" />
              {config ? formatEventDate(config.eventDate) : "October 2026"}
            </div>

            <h1 className="text-balance font-display text-3xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl md:text-6xl">
              Dandiya Night <span className="text-festival-gold">2026</span>
            </h1>

            <p className="mx-auto mt-5 max-w-md text-balance text-sm text-white/80 sm:text-base">
              Live raas, dhol beats, and a night of color at {config?.venue ?? "campus grounds"}. Dress
              sharp, dance sharper.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <LinkButton to="/register" className="w-full sm:w-auto">
                Register Now
              </LinkButton>
              <LinkButton to="/registration/status" variant="secondary" className="w-full sm:w-auto">
                Check Status
              </LinkButton>
            </div>
          </GlassPanel>
        </motion.div>
      </Container>
    </section>
  );
}
