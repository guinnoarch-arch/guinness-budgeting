import { FieldError, RequiredMark } from "../common/FormFeedback.jsx";
import { X } from "lucide-react";

// Pop-up for renaming, archiving or deleting a category.
export function CategoryEditorModal({ archiveCategory, categoryName, categoryNameErrors, closeCategoryEditor, editingCategory, saveCategory, setCategoryName }) {
  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={e => { e.preventDefault(); saveCategory(); }} noValidate>
        <div className="section-header">
          <h2>Edit category</h2>
          <button type="button" className="icon-button" onClick={closeCategoryEditor} aria-label="Close"><X size={18} aria-hidden="true" /></button>
        </div>

        <div className="form-grid">
          <label>
            <span>Category name<RequiredMark /></span>
            <input
              {...categoryNameErrors.fieldProps("name")}
              aria-required="true"
              type="text"
              placeholder="Category name"
              value={categoryName}
              onChange={e => setCategoryName(e.target.value)}
            />
            <FieldError fieldId={categoryNameErrors.getFieldId("name")} message={categoryNameErrors.errors.name} />
          </label>
        </div>

        <div className="modal-actions split-modal-actions">
          <div>
            <button
              type="button"
              className="danger-button"
              onClick={() => {
                if (archiveCategory(editingCategory)) closeCategoryEditor();
              }}
            >
              Archive category
            </button>
          </div>
          <div className="row-actions">
            <button type="button" className="secondary-button" onClick={closeCategoryEditor}>Cancel</button>
            <button className="primary-button">Save category</button>
          </div>
        </div>
      </form>
    </div>
  );
}
