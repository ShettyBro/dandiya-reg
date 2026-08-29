import { useState } from "react";
import { Link } from "react-router-dom";
import { List, X } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { Container } from "../ui/Container.js";
import { LinkButton } from "../ui/Button.js";

const NAV_LINKS = [
  { label: "Event", href: "#highlights" },
  { label: "Rules", href: "#rules" },
  { label: "Check Status", to: "/registration/status" }
];

export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-transparent">
      <Container className="flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/icons/icon-512.png" alt="Acharya" className="h-9 w-auto sm:h-10" />
          <span className="font-display text-lg font-semibold tracking-tight text-white">
            Dandiya Night <span className="text-festival-gold">2026</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-2 rounded-pill border border-white/10 bg-white/5 p-1.5 md:flex">
          {NAV_LINKS.map((link) =>
            link.to ? (
              <Link
                key={link.label}
                to={link.to}
                className="rounded-pill px-4 py-1.5 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white"
              >
                {link.label}
              </Link>
            ) : (
              <a
                key={link.label}
                href={link.href}
                className="rounded-pill px-4 py-1.5 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white"
              >
                {link.label}
              </a>
            )
          )}
          <LinkButton to="/register" className="px-5 py-2 text-sm">
            Register Now
          </LinkButton>
        </nav>

        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-pill border border-white/10 bg-white/5 text-white md:hidden"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X size={22} /> : <List size={22} />}
        </button>
      </Container>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-white/10 bg-midnight-950/90 md:hidden"
          >
            <Container className="flex flex-col gap-4 py-5">
              {NAV_LINKS.map((link) =>
                link.to ? (
                  <Link
                    key={link.label}
                    to={link.to}
                    onClick={() => setOpen(false)}
                    className="text-sm text-white/80"
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a
                    key={link.label}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="text-sm text-white/80"
                  >
                    {link.label}
                  </a>
                )
              )}
              <LinkButton to="/register" className="w-full">
                Register Now
              </LinkButton>
            </Container>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
