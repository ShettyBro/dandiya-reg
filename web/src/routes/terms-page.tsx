import { SiteNav } from "../components/layout/SiteNav.js";
import { SiteFooter } from "../components/layout/SiteFooter.js";
import { BambooGallery } from "../components/gallery/BambooGallery.js";
import { Container } from "../components/ui/Container.js";
import { GlassPanel } from "../components/ui/GlassPanel.js";

const SECTIONS = [
  {
    title: "Eligibility",
    body: "Registration is open only to current students with a valid @acharya.ac.in email address. Entry requires a valid college ID at the gate."
  },
  {
    title: "Payment and proof",
    body: "Payment is made through the college ERP outside this platform. After paying, submit your transaction ID and a clear screenshot of the payment confirmation. Verification is manual and may take time."
  },
  {
    title: "Rejected payments",
    body: "If your payment proof is rejected, you'll see the reason on the status page and can resubmit a corrected transaction ID and screenshot without creating a new registration."
  },
  {
    title: "Digital pass and QR",
    body: "Once approved, your pass and QR code are available on the pass retrieval page and by email. Your QR is single-use for entry; it is not the same as your registration code."
  },
  {
    title: "Privacy",
    body: "Your photo and payment screenshot are stored privately and are only ever accessed by finance and admin staff for verification and entry management."
  }
];

export function TermsPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-midnight-950">
      <BambooGallery />
      <SiteNav />
      <main className="relative z-10 flex-1 py-16">
        <Container className="max-w-2xl">
          <h1 className="mb-8 font-display text-2xl font-semibold text-white sm:text-3xl">
            Terms and event policies
          </h1>
          <div className="flex flex-col gap-4">
            {SECTIONS.map((section) => (
              <GlassPanel key={section.title} className="p-6">
                <h2 className="font-display text-base font-semibold text-white">{section.title}</h2>
                <p className="mt-2 text-sm text-white/70">{section.body}</p>
              </GlassPanel>
            ))}
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
