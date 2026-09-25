-- Commissiepercentage per styliste (0 tot 1, bijv. 0.12 = 12%). Leeg = standaard (COMMISSION_RATE, 10%).
alter table public.stylists add column if not exists commission_rate numeric
  check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 1));
