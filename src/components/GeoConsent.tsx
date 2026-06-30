import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { consentDecided, decideConsent } from "../lib/geoConsent";

/** One-time banner asking to use approximate location to pre-fill forms.
 *  Shows only until the user makes a choice (stored in a cookie). */
export function GeoConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!consentDecided()) setShow(true);
  }, []);

  if (!show) return null;

  const choose = async (allow: boolean) => {
    setShow(false);
    await decideConsent(allow).catch(() => {});
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
      <div className="mx-auto flex max-w-4xl flex-col items-start gap-3 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-gray-700 dark:text-gray-300">
          Use your approximate location to pre-fill your town and ZIP? It just saves typing — you can edit or skip it.{" "}
          <Link to="/privacy" className="text-brand-600 underline">Privacy</Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button onClick={() => choose(false)} className="btn-secondary !py-2 text-sm">No thanks</button>
          <button onClick={() => choose(true)} className="btn-primary !py-2 text-sm">Allow</button>
        </div>
      </div>
    </div>
  );
}
