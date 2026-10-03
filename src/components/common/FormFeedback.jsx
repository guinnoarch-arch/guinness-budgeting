import { AlertCircle } from "lucide-react";

// Error shown directly under the field that caused it. Uses an icon and text
// as well as colour, so it doesn't rely on colour alone.
export function FieldError({ fieldId, message }) {
  if (!message) return null;
  return (
    <span className="field-error" id={`${fieldId}-error`}>
      <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
      <span>{message}</span>
    </span>
  );
}

// Shown at the top of a form when more than one field needs fixing, with a
// link to each field.
export function ErrorSummary({ errors, getFieldId }) {
  const entries = Object.entries(errors || {});
  if (entries.length < 2) return null;

  return (
    <div className="error-summary" role="alert">
      <strong>
        <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
        Fix {entries.length} things before saving:
      </strong>
      <ul>
        {entries.map(([field, message]) => (
          <li key={field}>
            <a
              href={`#${getFieldId(field)}`}
              onClick={event => {
                event.preventDefault();
                document.getElementById(getFieldId(field))?.focus();
              }}
            >
              {message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Visual marker for a required field; the input itself gets aria-required.
export function RequiredMark() {
  return <span className="required-mark" aria-hidden="true"> *</span>;
}

// Form-level problem that isn't tied to one field (e.g. a save that failed).
export function FormError({ message }) {
  if (!message) return null;
  return (
    <div className="form-error" role="alert">
      <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
