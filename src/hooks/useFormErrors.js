import { useState } from "react";

// Field-level validation for a form.
// `validate(values)` returns { fieldName: "message" } for every problem.
//
// - On submit, validateAll() shows every error and moves focus to the first.
// - On blur, a field that has something typed in it is checked (so format
//   mistakes show early), but an empty field isn't flagged until submit.
// - While typing, call clearFixedErrors(values) (e.g. from an effect): an
//   existing error clears as soon as the value is valid, but no new error
//   appears mid-typing.
export default function useFormErrors(formId, validate) {
  const [errors, setErrors] = useState({});

  function getFieldId(field) {
    return `${formId}-${field}`;
  }

  function validateAll(values) {
    const nextErrors = validate(values);
    setErrors(nextErrors);
    const fields = Object.keys(nextErrors);
    if (fields.length) {
      window.requestAnimationFrame(() => document.getElementById(getFieldId(fields[0]))?.focus());
    }
    return fields.length === 0;
  }

  function validateFieldOnBlur(field, values) {
    const value = values[field];
    if (value === "" || value === null || value === undefined) return;
    const message = validate(values)[field];
    setErrors(prev => {
      if (!message && !prev[field]) return prev;
      const next = { ...prev };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });
  }

  // Call after values change: removes errors for fields that are now valid,
  // without adding new ones while the person is still typing.
  function clearFixedErrors(values) {
    const fields = Object.keys(errors);
    if (!fields.length) return;
    const current = validate(values);
    const fixed = fields.filter(field => !current[field]);
    if (!fixed.length) return;
    setErrors(prev => {
      const next = { ...prev };
      fixed.forEach(field => delete next[field]);
      return next;
    });
  }

  function setFieldError(field, message) {
    setErrors(prev => ({ ...prev, [field]: message }));
  }

  function resetErrors() {
    setErrors({});
  }

  // Spread onto the input: id, aria-invalid and aria-describedby.
  function fieldProps(field) {
    const hasError = Boolean(errors[field]);
    return {
      id: getFieldId(field),
      "aria-invalid": hasError || undefined,
      "aria-describedby": hasError ? `${getFieldId(field)}-error` : undefined
    };
  }

  return { errors, getFieldId, validateAll, validateFieldOnBlur, clearFixedErrors, setFieldError, resetErrors, fieldProps };
}
