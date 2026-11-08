"use client";

import { useEffect, useState } from "react";
import LegacyStudio from "./legacy-studio";
import FounderStudio from "./founder-studio";

export default function Page() {
  const [legacy, setLegacy] = useState(false);
  useEffect(() => {
    const sync = () =>
      setLegacy(
        location.hash === "#scenarios" ||
          location.hash === "#workbench" ||
          location.hash.startsWith("#project/"),
      );
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return legacy ? (
    <>
      <a className="founder-return" href="#founder">
        ← Back to your founder studio
      </a>
      <LegacyStudio />
    </>
  ) : (
    <FounderStudio />
  );
}
