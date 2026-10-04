import { calculateHouseSummary } from "../../utils/houseTracking.js";
import { formatMoney } from "../../utils/money.js";
import { HouseDetailPanel } from "./HouseDetailPanel.jsx";
import { formatLoanToValue } from "./loanDisplay.js";

export function HouseSection({
  appData,
  houseSummary,
  selectedHouse,
  setSelectedHouseId,
  onAddHouse,
  onEditHouse,
  onArchiveHouse,
  onRestoreHouse,
  onAddContribution,
  onEditContribution,
  onDeleteContribution,
  onAddPerson,
  sharingStatus,
  sharingBusy,
  onRefreshSharedHouses,
  onPublishHouse,
  onInviteHouse,
  onAcceptInvite,
  onDeclineInvite,
  onCancelInvite,
  onChangeMemberRole,
  onRemoveMember
}) {
  const archivedHouses = houseSummary.houses.filter(house => house.status === "archived" || house.archived);
  const selectedSummary = selectedHouse ? calculateHouseSummary(appData, selectedHouse) : null;

  return (
    <section className="card house-section">
      <div className="section-header compact-header">
        <div>
          <p className="eyebrow">House</p>
          <h3>House, mortgage and contributions</h3>
        </div>
        <button type="button" className="primary-button" onClick={onAddHouse}>Add house</button>
      </div>

      <div className="loan-detail-grid">
        <div className="sub-card loan-detail-card">
          <small>Total house value</small>
          <strong>{formatMoney(houseSummary.totalHouseValue)}</strong>
        </div>
        <div className="sub-card loan-detail-card">
          <small>Total mortgage balance</small>
          <strong>{formatMoney(houseSummary.totalMortgageBalance)}</strong>
        </div>
        <div className="sub-card loan-detail-card positive-card-soft">
          <small>Estimated equity</small>
          <strong>{formatMoney(houseSummary.totalEquity)}</strong>
        </div>
        <div className="sub-card loan-detail-card">
          <small>Total contributed</small>
          <strong>{formatMoney(houseSummary.totalContributed)}</strong>
        </div>
        <div className="sub-card loan-detail-card">
          <small>Loan to value</small>
          <strong>{formatLoanToValue(houseSummary.totalLoanToValuePercent)}</strong>
        </div>
      </div>

      {houseSummary.houses.length === 0 ? (
        <div className="loan-closed-state-card sub-card">
          <h4>No houses yet</h4>
          <p className="muted">Add a house to track its value, mortgage and who paid what.</p>
        </div>
      ) : (
        <div className="house-layout-grid">
          <div className="house-list-panel">
            <h4>Houses</h4>
            <div className="loan-tile-grid">
              {houseSummary.activeHouses.map(house => {
                const summary = calculateHouseSummary(appData, house);
                return (
                  <button
                    type="button"
                    key={house.id}
                    className={`loan-summary-tile ${selectedHouse?.id === house.id ? "selected" : ""}`}
                    onClick={() => setSelectedHouseId(house.id)}
                  >
                    <span className="loan-summary-type">{house.archived ? "Archived house" : "House"}</span>
                    <strong>{house.name}</strong>
                    <span className="loan-summary-amount">{formatMoney(summary.estimatedEquity, false)}</span>
                    <small>{formatMoney(summary.mortgageBalance, false)} mortgage{summary.loanToValuePercent !== null ? ` · ${formatLoanToValue(summary.loanToValuePercent)} LTV` : ""} · {summary.people.length} people</small>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedHouse && selectedSummary && (
            <HouseDetailPanel
              house={selectedHouse}
              summary={selectedSummary}
              appData={appData}
              onEdit={() => onEditHouse(selectedHouse)}
              onArchive={() => onArchiveHouse(selectedHouse)}
              onAddContribution={() => onAddContribution(selectedHouse)}
              onEditContribution={(contribution) => onEditContribution(selectedHouse, contribution)}
              onDeleteContribution={onDeleteContribution}
              onAddPerson={() => onAddPerson(selectedHouse)}
              sharingStatus={sharingStatus}
              sharingBusy={sharingBusy}
              onRefreshSharedHouses={onRefreshSharedHouses}
              onPublishHouse={() => onPublishHouse(selectedHouse)}
              onInviteHouse={(identifier, role) => onInviteHouse(selectedHouse, identifier, role)}
              onAcceptInvite={onAcceptInvite}
              onDeclineInvite={onDeclineInvite}
              onCancelInvite={(invite) => onCancelInvite(selectedHouse, invite)}
              onChangeMemberRole={(member, role) => onChangeMemberRole(selectedHouse, member, role)}
              onRemoveMember={(member) => onRemoveMember(selectedHouse, member)}
            />
          )}
        </div>
      )}

      <details className="loan-extra-details-card">
        <summary>Archived houses</summary>
        {archivedHouses.length === 0 ? (
          <p className="muted-text">No archived houses yet.</p>
        ) : (
          <div className="archive-list">
            {archivedHouses.map(house => (
              <div key={house.id} className="archive-row">
                <div>
                  <strong>{house.name}</strong>
                  <small>Archived {house.archivedAt ? house.archivedAt.slice(0, 10) : ""}</small>
                </div>
                <div className="row-actions archive-row-actions">
                  <button type="button" className="secondary-button" onClick={() => onRestoreHouse(house)}>Restore</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </details>
    </section>
  );
}
