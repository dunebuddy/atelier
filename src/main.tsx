import "./janela";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { JanelaSolta, ROTA_SOLTA } from "./components/JanelaSolta";
import { ouvirErrosSoltos, Quebrou } from "./components/Quebrou";
import "./styles.css";

ouvirErrosSoltos();
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Quebrou onde="app" global>
      {/* ?solta=<rota>: a janelinha destacada, só com aquela aba */}
      {ROTA_SOLTA ? <JanelaSolta rota={ROTA_SOLTA} /> : <App />}
    </Quebrou>
  </React.StrictMode>,
);
