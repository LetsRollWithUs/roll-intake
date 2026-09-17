import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { lockDocument } from "@/lib/lock-document";

const TZ = "Europe/Amsterdam";
const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function BookDone() {
  const [params] = useSearchParams();
  const bookingId = params.get("booking") ?? "";
  const [state, setState] = useState<"loading" | "confirmed" | "pending" | "error">("loading");
  const [startAt, setStartAt] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const tries = useRef(0);

  useEffect(() => lockDocument(), []);

  useEffect(() => {
    if (!bookingId) {
      setState("error");
      return;
    }
    let stop = false;
    const poll = async () => {
      const { data, error } = await supabase.functions.invoke("booking", {
        body: { action: "status", booking_id: bookingId },
      });
      if (stop) return;
      if (error || !data) {
        setState("error");
        return;
      }
      setStartAt(data.start_at ?? null);
      setMode(data.mode ?? null);
      if (data.status === "confirmed") {
        setState("confirmed");
        return;
      }
      tries.current += 1;
      if (tries.current > 20) {
        setState("pending");
        return;
      }
      setTimeout(poll, 3000);
    };
    poll();
    return () => {
      stop = true;
    };
  }, [bookingId]);

  const intakeUrl = `/?booking=${encodeURIComponent(bookingId)}${mode ? `&mode=${encodeURIComponent(mode)}` : ""}`;

  return (
    <div className="rd-root" style={{ background: "var(--rd-offwhite)", color: "var(--rd-aubergine)", overflowY: "auto" }}>
      <div className="rd-col" style={{ padding: "40px 22px 60px" }}>
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 8 }}>
          Roll · Kleuradvies
        </div>

        {state === "loading" && (
          <>
            <h1 className="rd-h2" style={{ marginBottom: 8 }}>
              We bevestigen je afspraak...
            </h1>
            <p className="rd-sub">Een moment, we verwerken je betaling.</p>
          </>
        )}

        {state === "confirmed" && (
          <div className="rd-rise">
            <h1 className="rd-h2" style={{ marginBottom: 8 }}>
              Je afspraak staat!
            </h1>
            {startAt && (
              <div className="rd-card-white" style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 18 }}>
                  {dateLabel(startAt)} · {timeLabel(startAt)}
                </div>
                <p className="rd-sub" style={{ marginTop: 8 }}>
                  30 minuten met een van onze kleuradviseurs.
                </p>
              </div>
            )}
            <div className="rd-card-white" style={{ marginTop: 12, background: "var(--rd-lime)" }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
                Bereid je gesprek nu voor
              </div>
              <p className="rd-sub" style={{ marginTop: 0, marginBottom: 12 }}>
                Vul de korte intake in, dan kan je adviseur zich voorbereiden en gebruiken jullie het
                gesprek om echt keuzes te maken.
              </p>
              <a href={intakeUrl} className="rd-btn rd-btn-primary rd-btn-lg" style={{ textDecoration: "none" }}>
                Naar mijn intake
              </a>
            </div>
          </div>
        )}

        {state === "pending" && (
          <>
            <h1 className="rd-h2" style={{ marginBottom: 8 }}>
              Betaling nog niet bevestigd
            </h1>
            <p className="rd-sub">
              Het duurt iets langer dan verwacht. Zodra je betaling binnen is, krijg je een
              bevestiging per e-mail. Je kunt deze pagina straks vernieuwen.
            </p>
          </>
        )}

        {state === "error" && (
          <>
            <h1 className="rd-h2" style={{ marginBottom: 8 }}>
              We konden je afspraak niet vinden
            </h1>
            <p className="rd-sub">Neem gerust contact op, dan zoeken we het samen uit.</p>
          </>
        )}
      </div>
    </div>
  );
}
