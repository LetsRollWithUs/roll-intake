import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { KlantDemo } from "./dashboard/klant/Demo";
import "./index.css";
import "./styles/redesign.css";
import { App } from "./App";
import { Dashboard } from "./dashboard/Dashboard";
import { BookFlow } from "./booking/BookFlow";
import { BookDone } from "./booking/BookDone";
import { ManageBooking } from "./booking/ManageBooking";
import { PlanFlow } from "./booking/PlanFlow";
import { laadRekenregels } from "./lib/rekenregels";

// Het oude adres van de werkplek (/beheer/...) leidt naar dezelfde pagina onder /dashboard/...
// Op intake.roll.nl stuurt Vercel al door naar roll.nl/dashboard; dit vangt lokaal en op testadressen op.
function OudBeheer() {
  const l = useLocation();
  return <Navigate to={`/dashboard${l.pathname.slice("/beheer".length)}${l.search}${l.hash}`} replace />;
}

const start = () => createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {import.meta.env.DEV && <Route path="/klant-demo" element={<KlantDemo />} />}
        <Route path="/dashboard/*" element={<Dashboard />} />
        <Route path="/beheer/*" element={<OudBeheer />} />
        <Route path="/boek" element={<BookFlow />} />
        <Route path="/boek/klaar" element={<BookDone />} />
        <Route path="/boek/beheer" element={<ManageBooking />} />
        <Route path="/plan" element={<PlanFlow />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);

// Rekenregels live uit de offerte-plugin. Het beheer (waar we verf uitrekenen) wacht er even op;
// de klant-intake start meteen en krijgt de waarden op de achtergrond.
if (/^\/(dashboard|beheer)(\/|$)/.test(location.pathname)) laadRekenregels().finally(start);
else { start(); void laadRekenregels(); }
