import { useState } from "react";
import { calculateLoanEstimate } from "../../utils/loanCalculations.js";
import { formatMoney } from "../../utils/money.js";
import { getLoanTimelineEvents } from "../../utils/loanLinking.js";
import { HouseMortgagePanel } from "./HouseMortgagePanel.jsx";
import { HouseSharingPanel } from "./HouseSharingPanel.jsx";
import { ContributionSplitList, HouseBalanceEstimate, HouseContributionTable, InfoMetric, LoanToValueMetric } from "./HouseSummaryParts.jsx";
import { buildMortgageLoanFromHouse } from "../../utils/houseMortgage.js";

// House sections as tabs (one full-width section at a time) rather than a
// grid of narrow columns. The last tab used is remembered per browser.
const HOUSE_TABS = [
  ["overview", "Overview"],
  ["mortgage", "Mortgage"],
  ["contributions", "Contributions"],
  ["people", "People / Splits"],
  ["agreement", "Agreement notes"],
  ["sharing", "Sharing"],
  ["linked", "Linked payments"]
];

const HOUSE_TAB_STORAGE_KEY = "gb.house.activeTab";

function readHouseTab() {
  try {
    const stored = window.localStorage.getItem(HOUSE_TAB_STORAGE_KEY);
    return HOUSE_TABS.some(([key]) => key === stored) ? stored : "overview";
  } catch {
    return "overview";
  }
}

export function HouseDetailPanel({
  house,
  summary,
  appData,
  onEdit,
  onArchive,
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
  const linkedAccount = (appData.accounts || []).find(account => account.id === house.mortgage?.linkedAccountId);
  const linkedTransactions = (appData.transactions || []).filter(transaction => transaction.linkedHouseId === house.id);
  const mortgageLoan = buildMortgageLoanFromHouse(house, appData);
  const mortgageEstimate = calculateLoanEstimate(mortgageLoan);
  const mortgageEvents = getLoanTimelineEvents(appData, mortgageLoan);
  const role = house.sharedRole || "owner";
  const isRemoteSharedHouse = Boolean(house.isSharedHouse);
  const canManageSharing = role === "owner";
  const canEditHouse = !isRemoteSharedHouse && role === "owner";
  const canAddContribution = role === "owner" || role === "editor";
  const canEditContributions = !isRemoteSharedHouse && role === "owner";
  const [activeTab, setActiveTab] = useState(readHouseTab);
  const selectTab = key => {
    setActiveTab(key);
    try {
      window.localStorage.setItem(HOUSE_TAB_STORAGE_KEY, key);
    } catch {
      // Storage blocked — the tab just won't be remembered.
    }
  };
  const splitLabel = house.ownershipMode === "manualOwnership"
    ? "Manual ownership split"
    : house.ownershipMode === "contributionEstimate"
      ? "Contribution-based estimate"
      : "Contribution tracking only";

  return (
    <div className="house-detail-panel">
      <div className="section-header compact-header">
        <div>
          <h3>{house.name}</h3>
          <p className="muted">{house.addressLabel || "No address label"} · {splitLabel}</p>
        </div>
        <div className="row-actions">
          {canAddContribution && <button type="button" className="secondary-button" onClick={onAddContribution}>Add contribution</button>}
          {canEditHouse && <button type="button" className="secondary-button" onClick={onAddPerson}>Add person</button>}
          {canEditHouse && <button type="button" className="secondary-button" onClick={onEdit}>Edit house</button>}
          {canEditHouse && <button type="button" className="danger-button" onClick={onArchive}>Archive</button>}
        </div>
      </div>

      <div className="house-tabs" role="tablist" aria-label="House sections">
        {HOUSE_TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`house-tab-${key}`}
            aria-selected={activeTab === key}
            aria-controls={`house-tab-panel-${key}`}
            className={`filter-chip ${activeTab === key ? "active" : ""}`}
            onClick={() => selectTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <section className="sub-card house-tab-card" role="tabpanel" id="house-tab-panel-overview" aria-labelledby="house-tab-overview">
          <h4>Overview</h4>
          <div className="loan-detail-grid">
            <InfoMetric label="Property value" value={formatMoney(summary.propertyValue)} />
            <InfoMetric label="Mortgage balance" value={formatMoney(summary.mortgageBalance)} />
            <InfoMetric label="Estimated equity" value={formatMoney(summary.estimatedEquity)} />
            <LoanToValueMetric balance={summary.mortgageBalance} value={summary.propertyValue} purchasePrice={summary.purchasePrice} />
            <InfoMetric label="Total contributed" value={formatMoney(summary.totalContributed)} />
          </div>
          <ContributionSplitList summary={summary} />
        </section>
      )}
      {activeTab === "mortgage" && (
        <section className="sub-card house-tab-card" role="tabpanel" id="house-tab-panel-mortgage" aria-labelledby="house-tab-mortgage">
          <HouseMortgagePanel
            house={house}
            summary={summary}
            mortgageLoan={mortgageLoan}
            mortgageEstimate={mortgageEstimate}
            mortgageEvents={mortgageEvents}
            appData={appData}
            linkedAccount={linkedAccount}
          />
        </section>
      )}
      {activeTab === "contributions" && (
        <section className="sub-card house-tab-card" role="tabpanel" id="house-tab-panel-contributions" aria-labelledby="house-tab-contributions">
          <h4>Contributions</h4>
          <div className="loan-detail-grid">
            <InfoMetric label="Deposits" value={formatMoney(summary.depositTotal)} />
            <InfoMetric label="Mortgage payments" value={formatMoney(summary.mortgagePaymentTotal)} />
            <InfoMetric label="Overpayments" value={formatMoney(summary.mortgageOverpaymentTotal)} />
            <InfoMetric label="House costs" value={formatMoney(summary.houseCostTotal)} />
            <InfoMetric label="External" value={formatMoney(summary.externalTotal)} />
            <InfoMetric label="Linked app transactions" value={formatMoney(summary.linkedTotal)} />
          </div>
          <HouseContributionTable contributions={summary.contributions} people={summary.people} onEditContribution={onEditContribution} onDeleteContribution={onDeleteContribution} canEdit={canEditContributions} />
        </section>
      )}
      {activeTab === "people" && (
        <section className="sub-card house-tab-card" role="tabpanel" id="house-tab-panel-people" aria-labelledby="house-tab-people">
          <h4>People / Splits</h4>
          {summary.people.length === 0 ? (
            <p className="muted-text">Add people to attribute deposits, mortgage payments and other house costs.</p>
          ) : (
            <div className="house-person-list">
              {summary.people.map(person => {
                const split = summary.splits.find(item => item.personId === person.id);
                const total = summary.byPerson.find(item => item.personId === person.id)?.amount || 0;
                return (
                  <div key={person.id} className="house-person-row">
                    <div>
                      <strong>{person.name}</strong>
                      <small>{person.email || person.label || "House person"}</small>
                    </div>
                    <div>
                      <strong>{formatMoney(total)}</strong>
                      {split && <small>{split.percentage}% manual ownership</small>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {house.ownershipMode === "manualOwnership" && (
            <p className={summary.manualSplitValid ? "muted-text" : "danger-text"}>
              Manual ownership total: {summary.manualTotalPercentage.toFixed(1)}%. {summary.manualSplitValid ? "Looks valid." : "This should total 100%."}
            </p>
          )}
          <HouseBalanceEstimate summary={summary} />
        </section>
      )}
      {activeTab === "agreement" && (
        <section className="sub-card house-tab-card" role="tabpanel" id="house-tab-panel-agreement" aria-labelledby="house-tab-agreement">
          <h4>Agreement notes</h4>
          <p>{house.agreementNotes || "No agreement notes recorded yet."}</p>
        </section>
      )}
      {activeTab === "sharing" && (
        <section className="sub-card house-tab-card" role="tabpanel" id="house-tab-panel-sharing" aria-labelledby="house-tab-sharing">
          <HouseSharingPanel
            house={house}
            members={(appData.houseMembers || []).filter(member => member.houseId === house.id)}
            invites={(appData.houseInvites || []).filter(invite => invite.houseId === house.id)}
            role={role}
            sharingStatus={sharingStatus}
            sharingBusy={sharingBusy}
            canManageSharing={canManageSharing}
            onRefresh={onRefreshSharedHouses}
            onPublish={onPublishHouse}
            onInvite={onInviteHouse}
            onAcceptInvite={onAcceptInvite}
            onDeclineInvite={onDeclineInvite}
            onCancelInvite={onCancelInvite}
            onChangeMemberRole={onChangeMemberRole}
            onRemoveMember={onRemoveMember}
          />
        </section>
      )}
      {activeTab === "linked" && (
        <section className="sub-card house-tab-card" role="tabpanel" id="house-tab-panel-linked" aria-labelledby="house-tab-linked">
          <h4>Linked payments</h4>
          <p className="muted-text">{linkedTransactions.length} tracked app transaction(s) link to this house. Shared users should only see the safe contribution summary, not private account balances or unrelated transaction details.</p>
        </section>
      )}
    </div>
  );
}
