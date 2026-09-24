import { Link } from "react-router-dom";
import { InstagramLogo, Phone } from "@phosphor-icons/react";
import { Container } from "../ui/Container.js";

const EVENT_CONTACTS = [
  { name: "Abhishek Tiwari", phone: "9531931223" },
  { name: "Rohan Kumar", phone: "9031505147" },
  { name: "Gunjesh Chauhan", phone: "9329696618" }
] as const;

const INSTAGRAM_URL = "https://www.instagram.com/acharya_sahitya?stkn=MW9zem5qeGY0Zm0zag%3D%3D";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 py-10">
      <Container className="flex flex-col items-center gap-8 text-sm text-white/50">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-xs uppercase tracking-[0.14em] text-white/40">For any queries, contact</p>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {EVENT_CONTACTS.map((contact) => (
              <a
                key={contact.phone}
                href={`tel:+91${contact.phone}`}
                className="flex items-center gap-1.5 text-white/70 hover:text-festival-gold"
              >
                <Phone size={14} weight="fill" className="text-festival-gold" />
                {contact.name} — {contact.phone.slice(0, 5)} {contact.phone.slice(5)}
              </a>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 sm:w-full sm:flex-row">
          <p>Dandiya Night 2026</p>
          <div className="flex flex-wrap items-center justify-center gap-6">
            <Link to="/terms" className="hover:text-white/80">
              Terms
            </Link>
            <Link to="/registration/pass" className="hover:text-white/80">
              My Pass
            </Link>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-white/80"
            >
              <InstagramLogo size={16} weight="fill" />
              @acharya_sahitya
            </a>
          </div>
          <p>
            Built by{" "}
            <a
              href="https://sudeepbro.in"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-festival-gold [text-shadow:0_0_10px_rgba(236,192,122,0.85),0_0_22px_rgba(236,192,122,0.5)] transition-[text-shadow] hover:[text-shadow:0_0_14px_rgba(236,192,122,1),0_0_30px_rgba(236,192,122,0.7)]"
            >
              ShettyBro
            </a>
          </p>
        </div>
      </Container>
    </footer>
  );
}
