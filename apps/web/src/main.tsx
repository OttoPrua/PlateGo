import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NullAdProvider, PlateGoApp } from "@platego/client-app";
import "@platego/client-app/styles.css";
import { OfficialMock } from "./OfficialMock";
import "./official-mock.css";

const isOfficialMock = window.location.pathname.startsWith("/official-mock");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isOfficialMock
      ? <OfficialMock />
      : <NullAdProvider><PlateGoApp surface="web" officialMockUrl="/official-mock" /></NullAdProvider>}
  </StrictMode>
);
