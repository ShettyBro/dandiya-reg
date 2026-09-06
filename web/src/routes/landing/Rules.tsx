import { motion } from "motion/react";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { Container } from "../../components/ui/Container.js";
import { GlassPanel } from "../../components/ui/GlassPanel.js";

const DOS = [
  "Be on time and plan your day to avoid a last-minute rush.",
  "Carry your College ID Card and invitation/confirmation mail for entry checking.",
  "Wear ethnic/traditional attire compulsorily — kurta, lehenga, saree, chaniya choli, etc. Avoid casual Western wear.",
  "Cooperate with security personnel, police officials, and event volunteers.",
  "Enjoy responsibly and maintain discipline throughout the event."
];

const DONTS = [
  "Do not bring bags, cosmetics, keychains, sharp objects, watches, bangles, rings, metal bracelets, or other metal accessories.",
  "Male participants: kadas, rings, and metal accessories are strictly prohibited.",
  "Do not bring water bottles, liquids, food, or any edible items inside the campus/event area.",
  "Do not engage in suspicious activity, misbehaviour, or anything that disrupts peace.",
  "Do not misbehave with women. Misconduct can lead to action by management and police.",
  "Do not carry valuables. Management is not responsible for lost or misplaced belongings.",
  "No cloakroom facility is provided.",
  "Do not enter under the influence of alcohol or intoxicating substances. Such individuals will be denied entry or removed from the venue.",
  "Police, security, and management personnel have the authority to detain students involved in misconduct or activities disrupting peace.",
  "Violations can result in immediate suspension/removal from the event and disciplinary action."
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

        <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5 }}
          >
            <GlassPanel className="h-full p-6">
              <div className="mb-4 flex items-center gap-2 text-emerald-300">
                <CheckCircle size={22} weight="fill" />
                <h3 className="font-display text-lg font-semibold text-white">Do's</h3>
              </div>
              <ul className="flex flex-col gap-3 text-sm text-white/75">
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
            <GlassPanel className="h-full p-6">
              <div className="mb-4 flex items-center gap-2 text-red-300">
                <XCircle size={22} weight="fill" />
                <h3 className="font-display text-lg font-semibold text-white">Don'ts</h3>
              </div>
              <ul className="flex flex-col gap-3 text-sm text-white/75">
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
