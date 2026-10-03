import { useEffect, useRef, useState } from "react";
import { markAppDataChanged } from "../services/storageService.js";

const UNDO_WINDOW_MS = 10000;

// "Deleted X — Undo" for a short time after a change.
// The offer is { message, restoreData, resultData, onExpire }.
export default function useUndoOffer({ appData, appDataRef, setAppData }) {
  const [undoOffer, setUndoOffer] = useState(null);
  const undoOfferRef = useRef(null);
  undoOfferRef.current = undoOffer;

  useEffect(() => {
    if (!undoOffer) return undefined;
    const timer = window.setTimeout(finaliseUndoOffer, UNDO_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [undoOffer]);

  useEffect(() => {
    // Data replaced some other way (cloud sync, restore, recurring bills):
    // Undo would roll that back too, so end the offer.
    if (undoOfferRef.current && appData !== undoOfferRef.current.resultData) finaliseUndoOffer();
  }, [appData]);

  // Ends the current Undo offer for good (e.g. finally deletes a receipt file
  // that was kept around in case of Undo).
  function finaliseUndoOffer() {
    const offer = undoOfferRef.current;
    if (!offer) return;
    undoOfferRef.current = null;
    setUndoOffer(null);
    offer.onExpire?.();
  }

  // Applies a change that can be undone for a short time. Undo restores the
  // snapshot from just before the change, so it's only allowed while that
  // change is still the latest one — any later edit or sync ends the offer.
  function updateAppDataWithUndo(nextData, { message, onExpire = null, ...options }) {
    finaliseUndoOffer();
    const restoreData = appDataRef.current;
    const resultData = markAppDataChanged(nextData, options);
    setAppData(resultData);
    setUndoOffer({ message, restoreData, resultData, onExpire });
  }

  function undoLastChange() {
    const offer = undoOfferRef.current;
    if (!offer) return;
    undoOfferRef.current = null;
    setUndoOffer(null);
    if (appDataRef.current !== offer.resultData) return;
    setAppData(markAppDataChanged(offer.restoreData, { reason: "Undo" }));
  }

  return { undoOffer, finaliseUndoOffer, updateAppDataWithUndo, undoLastChange };
}
