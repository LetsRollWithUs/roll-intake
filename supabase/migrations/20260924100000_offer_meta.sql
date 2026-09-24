-- Gegevens van de offerte uit de offerte-tool (roll-advies/v1/offerte) en de tools-keuze.
-- Vorm: { tools_in_cart: boolean, id?: number, nummer?: string, edit_url?: string, at?: string }
alter table public.intake add column if not exists offer_meta jsonb;
