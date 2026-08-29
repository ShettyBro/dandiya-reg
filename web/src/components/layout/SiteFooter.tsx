import { Link } from "react-router-dom";
import { Container } from "../ui/Container.js";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 py-10">
      <Container className="flex flex-col items-center justify-between gap-4 text-sm text-white/50 sm:flex-row">
        <p>Dandiya Night 2026</p>
        <div className="flex flex-wrap items-center justify-center gap-6">
          <Link to="/terms" className="hover:text-white/80">
            Terms
          </Link>
          <Link to="/registration/pass" className="hover:text-white/80">
            My Pass
          </Link>
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
      </Container>
    </footer>
  );
}
