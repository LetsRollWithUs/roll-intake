-- Producten die de styliste voor de opvolgmail selecteert (pack, stickers, verftesters).
-- Elk item: {kind: 'pack'|'sticker'|'tester', ref: pack-id of kleur-id, name}. De edge function
-- verrijkt bij het versturen met prijs, afbeelding en bestellink.
alter table public.intake add column if not exists advice_products jsonb not null default '[]'::jsonb;
