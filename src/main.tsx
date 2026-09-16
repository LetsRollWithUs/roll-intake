import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import "./styles/redesign.css";
import { App } from "./App";
import { Dashboard } from "./dashboard/Dashboard";
import { BookFlow } from "./booking/BookFlow";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/beheer/*" element={<Dashboard />} />
        <Route path="/boek" element={<BookFlow />} />
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
