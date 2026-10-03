import { useMemo, useState } from "react";
import { FieldError, RequiredMark } from "../components/common/FormFeedback.jsx";
import { calculateLoanSummary } from "../utils/loanCalculations.js";
import { calculateHousesSummary } from "../utils/houseTracking.js";
import { formatMoney } from "../utils/money.js";
import { HouseContributionModal } from "../components/loans/HouseContributionModal.jsx";
import { HouseModal } from "../components/loans/HouseModal.jsx";
import { HousePersonModal } from "../components/loans/HousePersonModal.jsx";
import { HouseSection } from "../components/loans/HouseSection.jsx";
import { LoanDetailPanel } from "../components/loans/LoanDetailPanel.jsx";
import { LoanModal } from "../components/loans/LoanModal.jsx";
import { LoanTile } from "../components/loans/LoanTile.jsx";
import useHouseSharing from "../hooks/useHouseSharing.js";
import useLoanEditor from "../hooks/useLoanEditor.js";
import useHouseEditor from "../hooks/useHouseEditor.js";
import "../styles/loans.css";

export default function LoansPage({ appData, actions }) {
  const { acceptInvite, cancelInvite, changeMemberRole, declineInvite, displayAppData, publishHouseForSharing, refreshSharedHouses, removeMember, sendHouseInvite, setSharingBusy, setSharingStatus, sharingBusy, sharingStatus } = useHouseSharing({ appData });
  const [selectedLoanId, setSelectedLoanId] = useState(null);
  const [selectedHouseId, setSelectedHouseId] = useState(null);
  const { archiveHouse, closeHouseModal, contributionForm, contributionFormError, contributionHouse, contributionValidation, deleteContribution, editingContribution, editingHouse, houseForm, houseValidation, openAddHouseModal, openContributionModal, openEditHouseModal, openPersonModal, personForm, personHouse, personValidation, restoreHouse, setContributionHouse, setEditingContribution, setPersonHouse, showHouseModal, submitContribution, submitHouse, submitPerson, updateContributionForm, updateHouseForm, updatePersonForm } = useHouseEditor({ actions, appData, displayAppData, refreshSharedHouses, setSelectedHouseId, setSharingBusy, setSharingStatus });

  const summary = useMemo(() => calculateLoanSummary(appData), [appData]);
  const houseSummary = useMemo(() => calculateHousesSummary(displayAppData), [displayAppData]);
  const loanEvents = Array.isArray(appData.loanEvents) ? appData.loanEvents : [];
  const { archiveLoan, balanceUpdate, balanceUpdateLoan, balanceValidation, closeLoanModal, deleteLoan, editingLoan, loanForm, loanValidation, openAddLoanModal, openBalanceUpdate, openEditLoanModal, restoreLoan, setBalanceUpdate, setBalanceUpdateLoan, showLoanModal, submitBalanceUpdate, submitLoan, updateLoanForm } = useLoanEditor({ actions, setSelectedLoanId });
  const activeLoans = summary.loans;
  const selectedLoan = activeLoans.find(loan => loan.id === selectedLoanId) || null;
  const selectedHouse = houseSummary.houses.find(house => house.id === selectedHouseId) || houseSummary.activeHouses[0] || null;

  const archivedLoans = (appData.loans || []).filter(loan => loan.status === "archived");

  return (
    <div className="page-grid loans-page">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Loans</p>
          <h2>Loans tracker</h2>
        </div>
        <div className="row-actions">
          <button type="button" className="primary-button" onClick={openAddHouseModal}>+ House</button>
          <button type="button" className="secondary-button" onClick={() => openAddLoanModal("studentLoan")}>+ Student loan</button>
          <button type="button" className="primary-button" onClick={() => openAddLoanModal("mortgage")}>+ Mortgage</button>
        </div>
      </div>

      <HouseSection
        appData={displayAppData}
        houseSummary={houseSummary}
        selectedHouse={selectedHouse}
        setSelectedHouseId={setSelectedHouseId}
        onAddHouse={openAddHouseModal}
        onEditHouse={openEditHouseModal}
        onArchiveHouse={archiveHouse}
        onRestoreHouse={restoreHouse}
        onAddContribution={openContributionModal}
        onEditContribution={openContributionModal}
        onDeleteContribution={deleteContribution}
        onAddPerson={openPersonModal}
        sharingStatus={sharingStatus}
        sharingBusy={sharingBusy}
        onRefreshSharedHouses={refreshSharedHouses}
        onPublishHouse={publishHouseForSharing}
        onInviteHouse={sendHouseInvite}
        onAcceptInvite={acceptInvite}
        onDeclineInvite={declineInvite}
        onCancelInvite={cancelInvite}
        onChangeMemberRole={changeMemberRole}
        onRemoveMember={removeMember}
      />

      {activeLoans.length === 0 ? (
        <section className="card empty-state-card">
          <h3>No loans yet</h3>
          <p className="muted">Add a student loan or mortgage to start tracking balance, interest, repayments and projections.</p>
          <div className="row-actions">
            <button type="button" className="secondary-button" onClick={() => openAddLoanModal("studentLoan")}>Add student loan</button>
            <button type="button" className="primary-button" onClick={() => openAddLoanModal("mortgage")}>Add mortgage</button>
          </div>
        </section>
      ) : (
        <>
          <section className="card loan-tile-section">
            <div className="section-header compact-header">
              <div>
                <h3>Your loans</h3>
              </div>
              <strong>{formatMoney(summary.totalDebt, false)} total tracked</strong>
            </div>

            <div className="loan-tile-grid">
              {activeLoans.map((loan, index) => (
                <LoanTile
                  key={loan.id}
                  loan={loan}
                  index={index}
                  selected={loan.id === selectedLoanId}
                  onSelect={() => setSelectedLoanId(loan.id === selectedLoanId ? null : loan.id)}
                />
              ))}
            </div>
          </section>

          {selectedLoan ? (
            <LoanDetailPanel
              loan={selectedLoan}
              events={loanEvents.filter(event => event.loanId === selectedLoan.id)}
              onEdit={() => openEditLoanModal(selectedLoan)}
              onArchive={() => archiveLoan(selectedLoan)}
              onBalanceUpdate={() => openBalanceUpdate(selectedLoan)}
              onClose={() => setSelectedLoanId(null)}
              transactions={appData.transactions || []}
              appData={appData}
            />
          ) : (
            <section className="card loan-closed-state-card">
              <h3>No loan opened</h3>
            </section>
          )}
        </>
      )}

      <section className="card archived-budget-card">
        <div className="section-header compact-header">
          <div>
            <h3>Archived loans</h3>
          </div>
        </div>

        {archivedLoans.length === 0 ? (
          <p className="muted">No archived loans yet.</p>
        ) : (
          <div className="archive-list">
            {archivedLoans.map(loan => (
              <div key={loan.id} className="archive-row">
                <div>
                  <strong>{loan.name}</strong>
                  <small>{loan.type === "mortgage" ? "Mortgage" : "Student loan"} · archived {loan.archivedAt ? loan.archivedAt.slice(0, 10) : ""}</small>
                </div>
                <div className="row-actions archive-row-actions">
                  <strong>{formatMoney(loan.currentBalance)}</strong>
                  <button type="button" className="secondary-button" onClick={() => restoreLoan(loan)}>Restore</button>
                  <button type="button" className="danger-button" onClick={() => deleteLoan(loan)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showLoanModal && (
        <LoanModal
          loanForm={loanForm}
          editingLoan={editingLoan}
          updateLoanForm={updateLoanForm}
          closeLoanModal={closeLoanModal}
          submitLoan={submitLoan}
          validation={loanValidation}
        />
      )}

      {showHouseModal && (
        <HouseModal
          houseForm={houseForm}
          editingHouse={editingHouse}
          accounts={appData.accounts || []}
          updateHouseForm={updateHouseForm}
          closeHouseModal={closeHouseModal}
          submitHouse={submitHouse}
          validation={houseValidation}
        />
      )}

      {contributionHouse && (
        <HouseContributionModal
          house={contributionHouse}
          appData={displayAppData}
          contributionForm={contributionForm}
          updateContributionForm={updateContributionForm}
          submitContribution={submitContribution}
          isSaving={sharingBusy === "contribution"}
          validation={contributionValidation}
          formError={contributionFormError}
          editingContribution={editingContribution}
          closeContributionModal={() => { setContributionHouse(null); setEditingContribution(null); }}
        />
      )}

      {personHouse && (
        <HousePersonModal
          house={personHouse}
          personForm={personForm}
          updatePersonForm={updatePersonForm}
          submitPerson={submitPerson}
          closePersonModal={() => setPersonHouse(null)}
          validation={personValidation}
        />
      )}

      {balanceUpdateLoan && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={submitBalanceUpdate} noValidate>
            <div className="section-header">
              <h2>Update balance: {balanceUpdateLoan.name}</h2>
              <button type="button" className="icon-button" onClick={() => setBalanceUpdateLoan(null)} aria-label="Close">×</button>
            </div>

            <div className="form-grid">
              <label>
                <span>New balance<RequiredMark /></span>
                <input
                  {...balanceValidation.fieldProps("balance")}
                  aria-required="true"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={balanceUpdate.balance}
                  onChange={event => setBalanceUpdate(prev => ({ ...prev, balance: event.target.value }))}
                  onBlur={() => balanceValidation.validateFieldOnBlur("balance", balanceUpdate)}
                />
                <FieldError fieldId={balanceValidation.getFieldId("balance")} message={balanceValidation.errors.balance} />
              </label>
              <label>
                Balance date
                <input
                  type="date"
                  value={balanceUpdate.date}
                  onChange={event => setBalanceUpdate(prev => ({ ...prev, date: event.target.value }))}
                />
              </label>
              <label className="full-width">
                Note
                <input
                  value={balanceUpdate.note}
                  onChange={event => setBalanceUpdate(prev => ({ ...prev, note: event.target.value }))}
                  placeholder="Statement balance update"
                />
              </label>
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setBalanceUpdateLoan(null)}>Cancel</button>
              <button className="primary-button">Save balance update</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
