# V2.6.27 House Mortgage Preservation

This update keeps House as the bigger property container while restoring the full mortgage-tracking depth inside each House.

## What Changed

- Added a full Mortgage section inside each selected House.
- Reused the existing mortgage summary, projection graph, payoff calculation, linked-payment markers and event-history UI inside House.
- Added richer House mortgage fields: repayment type, remaining term, payment day, follow-on rate, planned monthly overpayment, overpayment allowance, early repayment charge marker and mortgage notes.
- Added House mortgage summary cards for balance, original borrowed amount, paid off, monthly repayment, rate, fixed/rate end, remaining term, projected payoff and linked account.
- Added House mortgage payment/overpayment totals for linked app payments and external payments.
- Kept external mortgage payments as house-only records that do not alter account balances.
- Kept linked app transactions as account-affecting transactions that are shown in the House mortgage view without being counted twice.

## Mortgage Data Mapping

Existing mortgage loans continue to be preserved. When a mortgage loan is surfaced as a House, these fields map safely:

- `loan.originalAmount` -> `house.mortgage.originalAmount`
- `loan.currentBalance` -> `house.mortgage.currentBalance`
- `loan.startDate` -> `house.mortgage.startDate`
- `loan.mortgageDetails.termYears` -> `house.mortgage.termYears`
- `loan.mortgageDetails.remainingTermMonths` -> `house.mortgage.remainingTermMonths`
- `loan.mortgageDetails.currentRate` -> `house.mortgage.interestRate`
- `loan.mortgageDetails.interestType` -> `house.mortgage.rateType`
- `loan.mortgageDetails.fixedUntil` -> `house.mortgage.fixedEndDate`
- `loan.mortgageDetails.monthlyPayment` -> `house.mortgage.monthlyPayment`
- `loan.mortgageDetails.plannedMonthlyOverpayment` -> `house.mortgage.plannedMonthlyOverpayment`
- `loan.mortgageDetails.overpaymentAllowancePercent` -> `house.mortgage.overpaymentAllowancePercent`

The migration is guarded by linked loan IDs, so it does not duplicate houses for the same mortgage.

## How To Test

1. Open `Loans -> House`.
2. Select a House that came from an old mortgage loan.
3. Confirm the Mortgage section shows detailed summary cards and the projection graph.
4. Edit the House and confirm the richer mortgage fields save/load.
5. Link a tracked transaction as a mortgage payment and confirm it appears in the House mortgage view while still affecting the account only once.
6. Add an external mortgage payment or overpayment contribution and confirm it appears in House totals without changing account balances.
7. Confirm Student loans still open in the normal Loans tracker.
8. Run `npm run build`.

## Known Limitations

- The projection remains an estimate based on the stored current balance, rate and monthly payment.
- External mortgage contributions are shown in House contribution/payment totals but are not converted into account transactions.
- Shared users should still only receive safe House summaries, not private account balances or unrelated financial records.
