import { motion } from "motion/react";
import { Container } from "../../components/ui/Container.js";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { LinkButton } from "../../components/ui/Button.js";
import { useEventConfig } from "../../lib/hooks/useEventConfig.js";

export function FinalCta() {
  const { config } = useEventConfig();
  const closed = config ? !config.registrationOpen : false;

  return (
    <section className="py-20 sm:py-28">
      <Container>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
        >
          <GlassPanel
            variant="solid"
            className="flex flex-col items-center gap-6 bg-midnight-800/80 px-6 py-14 text-center shadow-glow sm:px-16"
          >
            <h2 className="font-display text-3xl font-semibold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.85),0_4px_18px_rgba(0,0,0,0.55)] sm:text-4xl">
              {closed ? "Registration is now closed" : "Your spot is waiting"}
            </h2>
            <p className="max-w-md text-sm text-white/70">
              {closed
                ? "Capacity has been reached or registration has closed. Follow the college channels for any last updates."
                : config
                  ? `${config.remainingCapacity} spots left. Register now before the floor fills up.`
                  : "Register now before the floor fills up."}
            </p>
            <LinkButton to="/register" className={closed ? "pointer-events-none opacity-40" : ""}>
              Register Now
            </LinkButton>
          </GlassPanel>
        </motion.div>
      </Container>
    </section>
  );
}
