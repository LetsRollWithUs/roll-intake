-- Meetgegevens per ruimte voor de reken-engine (m² -> materialen -> later offerte).
-- Los van de ruwe klant-intake (intake.rooms) en van de advies-bundels, zodat de styliste
-- de maten kan bijstellen zonder de klantinvoer te overschrijven.
-- Vorm: { "<room_id>": { walls:[{w,h}], ceilings:[{l,b}],
--          woodwork:{doors, windows:[{w,h}], plinths_m, radiators:[{w,h}], cabinets:[{w,h}]},
--          wall_substrate:"bestaand"|"nieuw", wood_substrate:"gelakt"|"kaal", coats:int } }
alter table public.intake add column if not exists room_measures jsonb not null default '{}'::jsonb;
