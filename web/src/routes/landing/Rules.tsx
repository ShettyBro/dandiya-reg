import { motion } from "motion/react";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { Container } from "../../components/ui/Container.js";
import { GlassPanel } from "../../components/ui/GlassPanel.js";

const DOS = [
  "Carry your valid college ID and registration confirmation.",
  "Arrive on time and follow entry instructions.",
  "Wear traditional or festive attire.",
  "Cooperate with security, faculty and volunteers.",
  "Dance responsibly and maintain a safe distance.",
  "Use Dandiya sticks carefully and follow volunteer instructions.",
  "Keep the venue clean and use designated bins.",
  "Follow event announcements, emergency exits and other safety instructions."
];

const DONTS = [
  "Do not carry bags, backpacks or handbags into the venue.",
  "Consumption or possession of intoxicants is strictly prohibited. Anyone under the influence will be removed from the premises.",
  "Do not bring sharp objects, weapons, fireworks or prohibited items.",
  "Do not harass anyone or take photos/videos without consent.",
  "Do not push, shove, fight, threaten others or engage in ragging.",
  "Do not climb barricades, stage structures or enter restricted areas.",
  "Do not litter, smoke or vape in the event area.",
  "Do not leave expecting re-entry unless explicitly permitted."
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
          Event do's &amp; don'ts
        </motion.h2>
        <p className="mt-3 max-w-xl text-sm text-white/60">
          Non-Acharyan participants must additionally carry their physical College ID Card — the uploaded
          copy is for verification only and does not replace it.
        </p>
        <p className="mt-2 max-w-xl text-sm font-medium text-festival-gold/90">
          Your QR code is strictly personal and non-transferable. Once you exit the venue, re-entry will not be
          permitted.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5 }}
          >
            <GlassPanel variant="solid" className="h-full bg-midnight-800/80 p-6">
              <div className="mb-4 flex items-center gap-2 text-emerald-300">
                <CheckCircle size={22} weight="fill" />
                <h3 className="font-display text-lg font-semibold text-white">Do's</h3>
              </div>
              <ul className="flex flex-col gap-3 text-sm text-white/85">
                {DOS.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </GlassPanel>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5, delay: 0.05 }}
          >
            <GlassPanel variant="solid" className="h-full bg-midnight-800/80 p-6">
              <div className="mb-4 flex items-center gap-2 text-red-300">
                <XCircle size={22} weight="fill" />
                <h3 className="font-display text-lg font-semibold text-white">Don'ts</h3>
              </div>
              <ul className="flex flex-col gap-3 text-sm text-white/85">
                {DONTS.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </GlassPanel>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
