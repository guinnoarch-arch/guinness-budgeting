import { useEffect, useState } from "react";
import useFormErrors from "./useFormErrors.js";
import { checkRequiredText, collectErrors } from "../utils/validation.js";

function validateCategoryNameForm(values) {
  return collectErrors({
    name: checkRequiredText(values.name, "a name for the category")
  });
}

function fallbackCategoryId(categories, category) {
  const preferredIds = category.type === "income"
    ? ["cat_other_income", "cat_refund", "cat_gift"]
    : ["cat_other_expense", "cat_everything_else", "cat_shopping"];

  const preferred = preferredIds.find(id => id !== category.id && categories.some(item => item.id === id));
  if (preferred) return preferred;

  return categories.find(item => item.id !== category.id && item.type === category.type)?.id || null;
}

// Renaming, archiving, restoring and deleting a category.
export default function useCategoryEditor({ actions, appData }) {
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryName, setCategoryName] = useState("");
  const categoryNameErrors = useFormErrors("category-name", validateCategoryNameForm);

  useEffect(() => {
    categoryNameErrors.clearFixedErrors({ name: categoryName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryName]);

  function closeCategoryEditor() {
    setEditingCategory(null);
    categoryNameErrors.resetErrors();
  }

  function handleEditCategory(category) {
    setEditingCategory(category);
    setCategoryName(category.name);
  }

  function saveCategory() {
    if (!editingCategory) return;
    if (!categoryNameErrors.validateAll({ name: categoryName })) return;
    actions.updateAppData({
      ...appData,
      categories: appData.categories.map(c =>
        c.id === editingCategory.id
          ? { ...c, name: categoryName.trim(), isActive: true, isArchived: false, archivedAt: null, updatedAt: new Date().toISOString() }
          : c
      )
    }, { reason: "Category edited" });
    setEditingCategory(null);
    setCategoryName("");
  }

  function archiveCategory(category) {
    if (!category) return false;
    const activeBudgetCount = appData.budgets.filter(budget => budget.categoryId === category.id && !budget.isArchived && !budget.archivedAt).length;
    const detail = activeBudgetCount > 0 ? `\n\n${activeBudgetCount} active budget(s) using this category will also be archived.` : "";
    if (!window.confirm(`Archive the ${category.name} category? Existing transactions will keep this category for history.${detail}`)) return false;

    const now = new Date().toISOString();
    actions.updateAppData({
      ...appData,
      categories: appData.categories.map(item => (
        item.id === category.id
          ? { ...item, isActive: false, isArchived: true, archivedAt: now, updatedAt: now }
          : item
      )),
      budgets: appData.budgets.map(budget => (
        budget.categoryId === category.id && !budget.isArchived && !budget.archivedAt
          ? { ...budget, isEnabled: false, isArchived: true, archivedAt: now, updatedAt: now }
          : budget
      ))
    }, { reason: "Category archived" });
    return true;
  }

  function restoreCategory(category) {
    const now = new Date().toISOString();
    actions.updateAppData({
      ...appData,
      categories: appData.categories.map(item => (
        item.id === category.id
          ? { ...item, isActive: true, isArchived: false, archivedAt: null, updatedAt: now }
          : item
      )),
      settings: {
        ...(appData.settings || {}),
        deletedDefaultCategoryIds: (appData.settings?.deletedDefaultCategoryIds || []).filter(id => id !== category.id)
      }
    }, { reason: "Category restored" });
  }

  function permanentlyDeleteCategory(category) {
    const linkedTransactions = appData.transactions.filter(txn => txn.categoryId === category.id).length;
    const linkedBudgets = appData.budgets.filter(budget => budget.categoryId === category.id).length;
    const replacementCategoryId = fallbackCategoryId(appData.categories, category);
    const replacement = appData.categories.find(item => item.id === replacementCategoryId);
    const moveText = linkedTransactions > 0
      ? `\n\n${linkedTransactions} transaction(s) will be moved to ${replacement?.name || "no category"}.`
      : "";
    const budgetText = linkedBudgets > 0 ? `\n${linkedBudgets} budget record(s) using this category will be removed.` : "";

    if (!window.confirm(`Permanently delete the archived ${category.name} category? This cannot be undone.${moveText}${budgetText}`)) return;

    const deletedDefaultCategoryIds = category.isDefault
      ? [...new Set([...(appData.settings?.deletedDefaultCategoryIds || []), category.id])]
      : (appData.settings?.deletedDefaultCategoryIds || []);

    actions.updateAppData({
      ...appData,
      categories: appData.categories.filter(item => item.id !== category.id),
      transactions: appData.transactions.map(txn => (
        txn.categoryId === category.id ? { ...txn, categoryId: replacementCategoryId, updatedAt: new Date().toISOString() } : txn
      )),
      budgets: appData.budgets.filter(budget => budget.categoryId !== category.id),
      importRules: (appData.importRules || []).filter(rule => rule.categoryId !== category.id),
      settings: {
        ...(appData.settings || {}),
        deletedDefaultCategoryIds
      }
    }, { reason: "Archived category permanently deleted" });
  }

  return {
    archiveCategory,
    categoryName,
    categoryNameErrors,
    closeCategoryEditor,
    editingCategory,
    handleEditCategory,
    permanentlyDeleteCategory,
    restoreCategory,
    saveCategory,
    setCategoryName
  };
}
