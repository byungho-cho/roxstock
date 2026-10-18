-- Expand only DART original amounts. Existing integer values are exactly preserved.
ALTER TABLE `dart_financial_filings`
  MODIFY `revenue_quarter` DECIMAL(65,30) NULL,
  MODIFY `revenue_ytd` DECIMAL(65,30) NULL,
  MODIFY `operating_profit_quarter` DECIMAL(65,30) NULL,
  MODIFY `operating_profit_ytd` DECIMAL(65,30) NULL,
  MODIFY `net_income_quarter` DECIMAL(65,30) NULL,
  MODIFY `net_income_ytd` DECIMAL(65,30) NULL,
  MODIFY `total_assets` DECIMAL(65,30) NULL,
  MODIFY `total_liabilities` DECIMAL(65,30) NULL,
  MODIFY `total_equity` DECIMAL(65,30) NULL,
  MODIFY `operating_cash_flow_quarter` DECIMAL(65,30) NULL,
  MODIFY `operating_cash_flow_ytd` DECIMAL(65,30) NULL,
  MODIFY `capital_expenditure_quarter` DECIMAL(65,30) NULL,
  MODIFY `capital_expenditure_ytd` DECIMAL(65,30) NULL;
