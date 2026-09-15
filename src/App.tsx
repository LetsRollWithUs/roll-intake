/**
 * Roll Interieurintake — intake.roll.nl.
 * Skelet: hier komt de intakeflow voor de interieurstyliste.
 * De vraagteksten en de flow volgen uit het opzetje van Ingmar.
 */
export function App() {
  return (
    <main className="min-h-full flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-md">
        <p className="text-xs font-semibold tracking-[0.16em] uppercase text-pink">Roll · Interieuradvies</p>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight">Interieurintake</h1>
        <p className="mt-4 text-[15px] leading-relaxed opacity-80">
          Vertel ons over je ruimte en stijl, dan bereidt onze interieurstyliste jouw advies voor.
        </p>
        <p className="mt-8 text-xs opacity-50">Skelet — de intakevragen worden hier ingevuld.</p>
      </div>
    </main>
  );
}
