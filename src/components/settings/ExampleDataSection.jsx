import { removeExampleDataFromAppData } from "../../data/exampleData.js";

export default function ExampleDataSection({ appData, actions, accordion }) {
  const { activeSettingsSection, sectionClass, sectionHeaderProps, SectionChevron } = accordion;

  function removeExampleData() {
    if (!confirm("Remove example data? This removes demo transactions, budgets, bills, goals, closed months and example loan/house records. Default categories and real data will stay.")) return;
    actions.updateAppData(removeExampleDataFromAppData(appData), { reason: "Example data removed" });
    actions.notify("Example data removed. Everything you see now is your own data.");
  }

  return (
    <section className={sectionClass("exampleData")}>
      <div className="section-header settings-accordion-heading" {...sectionHeaderProps("exampleData")}>
        <div>
          <h3>Example data</h3>
          <p className="muted-text">Remove demo transactions, budgets, carry-forward, goals and example house/loan data while keeping default categories and real records.</p>
        </div>
        <SectionChevron sectionId="exampleData" />
      </div>
      {activeSettingsSection === "exampleData" && <button className="secondary-button" onClick={removeExampleData}>Remove example data</button>}
    </section>
  );
}
