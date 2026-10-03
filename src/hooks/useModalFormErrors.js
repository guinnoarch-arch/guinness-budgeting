import { useEffect } from "react";
import useFormErrors from "./useFormErrors.js";

// Clears a form's errors when its modal closes, and removes errors the
// person has fixed while the modal is open.
export function useModalFormErrors(formId, validate, isOpen, values) {
  const validation = useFormErrors(formId, validate);
  useEffect(() => {
    if (!isOpen) validation.resetErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  useEffect(() => {
    validation.clearFixedErrors(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);
  return validation;
}
