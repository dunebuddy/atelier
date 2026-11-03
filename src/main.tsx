import "./janela";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ouvirErrosSoltos, Quebrou } from "./components/Quebrou";
import "./styles.css";

ouvirErrosSoltos();
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Quebrou onde="app" global>
      <App />
    </Quebrou>
  </React.StrictMode>,
);
