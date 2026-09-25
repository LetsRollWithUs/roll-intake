// Mailtjes om een klant zonder afspraak naar /boek (of met tegoed naar /plan) te sturen.
// Opent het mailprogramma van de beheerder met een vriendelijk, voorgevuld bericht.
export const INTAKE_SITE = "https://intake.roll.nl";
export const BOOK_URL = `${INTAKE_SITE}/boek`;

const first = (name?: string | null) => (name ?? "").trim().split(/\s+/)[0] || "";
const mailto = (email: string, subject: string, body: string) =>
  `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

// Geen betaling en geen afspraak: naar de boekingspagina.
export function bookLinkMail(name: string | null, email: string): string {
  return mailto(email, "Plan je online kleuradvies", [
    `Hoi ${first(name) || "daar"},`,
    "",
    "Dank je wel voor het invullen van je intake! Daarmee kan je kleuradviseur zich goed voorbereiden op jouw ruimtes.",
    "",
    `Kies hier een moment dat jou uitkomt: ${BOOK_URL}`,
    "",
    "Gebruik bij het boeken hetzelfde e-mailadres, dan koppelen we je intake automatisch aan je afspraak.",
    "",
    "Hartelijke groet,",
    "Team Roll",
  ].join("\n"));
}

// Wel betaald (tegoed), nog niet ingepland: naar de planpagina met het eigen tegoed.
export function planLinkMail(name: string | null, email: string, token: string): string {
  return mailto(email, "Plan je online kleuradvies", [
    `Hoi ${first(name) || "daar"},`,
    "",
    "Dank je wel voor het invullen van je intake! Je kleuradvies staat al voor je klaar; je hoeft alleen nog een moment te kiezen.",
    "",
    `Plan hier je afspraak: ${INTAKE_SITE}/plan?token=${token}`,
    "",
    "Hartelijke groet,",
    "Team Roll",
  ].join("\n"));
}
