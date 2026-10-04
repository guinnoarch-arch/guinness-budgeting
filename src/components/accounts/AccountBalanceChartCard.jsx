import { AXIS_TICK, CHART_ANIMATION, GRID_PROPS } from "../../utils/chartTheme.js";
import { ACCOUNT_LINE_COLOURS, BALANCE_RANGE_OPTIONS } from "./accountDisplay.js";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "../../utils/money.js";
import ExpandableChart from "../common/ExpandableChart.jsx";
import { BalanceChartTooltip } from "./BalanceChartTooltip.jsx";

// Balance-over-time chart for the chosen accounts and range.
export function AccountBalanceChartCard({ accountPickerOpen, accounts, balanceChartData, balanceRange, selectAllChartAccounts, selectOnlyChartAccount, selectedAccountLabel, selectedChartAccounts, setAccountPickerOpen, setBalanceRange, toggleChartAccount, visibleChartAccountIds }) {
  return (
    <section className="card account-balance-chart-card">
      <div className="section-header compact-header account-balance-chart-header">
        <div>
          <h3>Account balances over time</h3>
        </div>
        <div className="account-chart-controls">
          <label className="compact-field account-range-select">
            Range
            <select value={balanceRange} onChange={event => setBalanceRange(event.target.value)}>
              {BALANCE_RANGE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="account-picker">
            <button
              type="button"
              className="secondary-button account-picker-button"
              onClick={() => setAccountPickerOpen(prev => !prev)}
            >
              {selectedAccountLabel}
            </button>
            {accountPickerOpen && (
              <div className="account-picker-menu">
                <div className="account-picker-actions">
                  <button type="button" className="text-button" onClick={selectAllChartAccounts}>All accounts</button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setAccountPickerOpen(false)}
                  >
                    Done
                  </button>
                </div>
                {accounts.map(account => (
                  <label key={account.id} className="account-picker-option">
                    <input
                      type="checkbox"
                      checked={visibleChartAccountIds.includes(account.id)}
                      onChange={() => toggleChartAccount(account.id)}
                    />
                    <span>{account.name}</span>
                    <button
                      type="button"
                      className="text-button mini-text-button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectOnlyChartAccount(account.id);
                      }}
                    >
                      Only
                    </button>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedChartAccounts.length === 0 ? (
        <p className="muted-text">Select at least one account to show the balance chart.</p>
      ) : (
        <ExpandableChart title={"Account balances over time"} height={320}>
          <LineChart data={balanceChartData} margin={{ top: 12, right: 22, left: 8, bottom: 16 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              dataKey="label"
              interval="preserveStartEnd"
              minTickGap={16}
              tick={AXIS_TICK}
            />
            <YAxis tick={AXIS_TICK} tickFormatter={(value) => formatMoney(value, false)} />
            <Tooltip content={<BalanceChartTooltip />} />
            {selectedChartAccounts.map((account, index) => (
              <Line isAnimationActive={CHART_ANIMATION}
                key={account.id}
                type="monotone"
                dataKey={account.id}
                name={account.name}
                stroke={ACCOUNT_LINE_COLOURS[index % ACCOUNT_LINE_COLOURS.length]}
                strokeWidth={2.5}
                dot={balanceChartData.length <= 12}
                connectNulls
              />
            ))}
          </LineChart>
        </ExpandableChart>
      )}
    </section>
  );
}
