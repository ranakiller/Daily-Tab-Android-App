import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Root from "../DailyTab.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
