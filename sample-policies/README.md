# Business Loan Sample Policies

A complete multi-bank business loan decision system demonstrating the full capability of the rule engine: hard filter rules, scorecards, financial health checks, CIBIL-tier branching, expression-valued output fields, and a CUSTOM_OUTPUT aggregation template.

---

## Policies (load in this order)

| File | Policy ID | Description |
|---|---|---|
| `au_bank_business_loan.json` | `au_bank_business_loan` | AU Small Finance Bank eligibility |
| `hdfc_bank_business_loan.json` | `hdfc_bank_business_loan` | HDFC Bank eligibility |
| `sbi_bank_business_loan.json` | `sbi_bank_business_loan` | SBI Bank eligibility with tier-based limits |
| `business_loan_master.json` | `business_loan_master` | Master aggregator — calls all 3, returns structured offers |

---

## Request Context Schema

```json
{
  "business": {
    "vintage_years": 4,
    "annual_turnover": 8000000,
    "type": "PRIVATE_LIMITED",
    "employee_count": 22
  },
  "applicant": {
    "credit_score": 730,
    "existing_dpd": 0
  },
  "financials": {
    "cash_flow_positive": true,
    "debt_to_equity": 1.1,
    "net_profit_margin": 0.14,
    "current_ratio": 1.6
  },
  "loan_request": {
    "amount": 5000000,
    "tenure_months": 48,
    "purpose": "EXPANSION"
  }
}
```

### Business types recognised by HDFC hard filter
`PRIVATE_LIMITED` | `LLP` | `PARTNERSHIP`
(Proprietorships and public limited companies are excluded by HDFC)

---

## Master policy response (sample)

```json
{
  "overall_status": "eligible",
  "eligible_bank_count": 2,
  "recommended_bank": "HDFC Bank",
  "offers": [
    {
      "bank": "AU Small Finance Bank",
      "status": "approved",
      "approved_limit": 5000000,
      "interest_rate": 15.5,
      "product": "Business Loan"
    },
    {
      "bank": "HDFC Bank",
      "status": "approved",
      "approved_limit": 5000000,
      "interest_rate": 11.0,
      "product": "Business Loan"
    },
    {
      "bank": "SBI Bank",
      "status": "rejected",
      "approved_limit": null,
      "interest_rate": null,
      "product": "Business Loan"
    }
  ]
}
```

> SBI rejected because `annual_turnover * 3 = 24,000,000` but `debt_to_equity = 1.1` and
> `net_profit_margin = 0.14` pass — actually SBI would approve in this example.
> Adjust the context to explore different outcomes.

---

## Policy design notes

### AU Bank
**Graph:** START → Hard Filter Rules → Credit Scorecard (MODEL) → Tier Decision (BRANCH) → OUTCOME

The scorecard has 4 variables (CIBIL, turnover, vintage, D/E) with a max of 100 points.
- **PRIME (≥70 pts):** 13.5% interest
- **STANDARD (50–69 pts):** 15.5% interest
- **SUBPRIME (<50 pts):** Rejected

### HDFC Bank
**Graph:** START → Hard Filter Rules → Credit Assessment Rules → OUTCOME

Most stringent: only Pvt Ltd / LLP / Partnership, minimum ₹50L turnover, CIBIL ≥ 700, and a second rule node enforcing a tighter profit margin and loan cap.

Interest rate bands: CIBIL ≥ 750 → 10.5%, ≥ 725 → 11.0%, else 11.5%

### SBI Bank
**Graph:** START → Basic Eligibility → Financial Health → CIBIL Tier (BRANCH) → OUTCOME

Two approved outcomes with different limits (output computed via `outputExpressions`):
- **Premium track (CIBIL ≥ 750):** up to 4× turnover, 9.5–10.5%
- **Standard track (CIBIL 675–749):** up to 3× turnover, 11.5%

### Master Aggregator
**Graph:** START → WF_AU → WF_HDFC → WF_SBI → CUSTOM_OUTPUT

All three WORKFLOW nodes always continue regardless of individual bank outcome (both `approved` and `rejected` handles route forward). The CUSTOM_OUTPUT template reads `au_bank.*`, `hdfc_bank.*`, `sbi_bank.*` from context and assembles the final structured response.

`recommended_bank` picks the lowest-rate bank among approved offers (HDFC < SBI < AU).
