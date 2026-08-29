import { motion } from "motion/react";
import { IdentificationCard, Prohibit, QrCode, Receipt } from "@phosphor-icons/react";
import { Container } from "../../components/ui/Container.js";
import { GlassPanel } from "../../components/ui/GlassPanel.js";

const RULES = [
  {
    icon: Receipt,
    title: "Payment proof required",
    body: "Pay through the college ERP, then upload your transaction ID and screenshot. Approval follows manual verification."
  },
  {
    icon: QrCode,
    title: "One QR, one entry",
    body: "Your digital pass is single-use. Screenshot it or keep your email handy for scanning at the gate."
  },
  {
    icon: IdentificationCard,
    title: "College ID mandatory",
    body: "Carry your college ID card. Entry is restricted to registered students of this campus."
  },
  {
    icon: Prohibit,
    title: "No outside entry",
    body: "Registration closes once capacity is reached. No spot registrations or outside guests at the gate."
  }
];

export function Rules() {
  return (
    <section id="rules" className="py-20 sm:py-28">
      <Container>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
          className="font-display text-3xl font-semibold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.85),0_4px_18px_rgba(0,0,0,0.55)] sm:text-4xl"
        >
          Entry rules
        </motion.h2>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {RULES.map((rule, index) => (
            <motion.div
              key={rule.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
            >
              <GlassPanel className="flex h-full gap-4 p-6">
                <rule.icon size={26} weight="duotone" className="mt-1 shrink-0 text-festival-gold" />
                <div>
                  <p className="font-display text-base font-semibold text-white">{rule.title}</p>
                  <p className="mt-1 text-sm text-white/70">{rule.body}</p>
                </div>
              </GlassPanel>
            </motion.div>
          ))}
        </div>
      </Container>
    </section>
  );
}
