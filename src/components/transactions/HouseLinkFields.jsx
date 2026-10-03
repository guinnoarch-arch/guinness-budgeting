import { HOUSE_CONTRIBUTION_TYPES } from "../../utils/houseTracking.js";

// Linking an expense to a house and attributing it to a person.
export function HouseLinkFields({ activeHouses, form, selectedHouse, selectedHousePeople, update }) {
  return (
    <div className="loan-link-box full-width">
      <div className="section-header compact-header">
        <div>
          <h4>House link</h4>
          <p className="muted-text">Linked house payments still affect this account balance as normal, then also count in House contributions.</p>
        </div>
      </div>

      <label>
        Link to house
        <select value={form.linkedHouseId || ""} onChange={e => update("linkedHouseId", e.target.value)}>
          <option value="">No house link</option>
          {activeHouses.map(house => (
            <option key={house.id} value={house.id}>{house.name}</option>
          ))}
        </select>
      </label>

      {selectedHouse && (
        <div className="loan-link-split-grid">
          <label>
            Contribution type
            <select value={form.houseContributionType} onChange={e => update("houseContributionType", e.target.value)}>
              {HOUSE_CONTRIBUTION_TYPES.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>

          <label>
            Paid by
            <select value={form.housePersonId || ""} onChange={e => update("housePersonId", e.target.value)}>
              <option value="">Unassigned</option>
              {selectedHousePeople.map(person => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </select>
          </label>

          {selectedHousePeople.length === 0 && (
            <p className="muted-text full-width">Add people in Loans, House, People / Splits to attribute this payment.</p>
          )}

          <label className="full-width">
            House contribution note
            <input
              value={form.houseContributionNotes}
              onChange={e => update("houseContributionNotes", e.target.value)}
              placeholder="Safe note for the house contribution"
            />
          </label>
        </div>
      )}
    </div>
  );
}
