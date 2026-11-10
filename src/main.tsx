import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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

const start = () => createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {import.meta.env.DEV && <Route path="/klant-demo" element={<KlantDemo />} />}
        <Route path="/beheer/*" element={<Dashboard />} />
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
if (location.pathname.startsWith("/beheer")) laadRekenregels().finally(start);
else { start(); void laadRekenregels(); }
