// Koppelen van advies-regels aan de ruimtes uit de intake: eerst op ruimte-id, anders op naam.
// Zo blijft de koppeling heel als de styliste de ruimtenaam anders spelt of aanpast.
export const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

export function sameRoom(a: { room_id?: string; room: string }, r: { id: string; label: string }): boolean {
  return a.room_id ? a.room_id === r.id : norm(a.room) === norm(r.label);
}

export function roomIdFor(label: string, rooms: { id: string; label: string }[]): string | undefined {
  return rooms.find((r) => norm(r.label) === norm(label))?.id;
}
