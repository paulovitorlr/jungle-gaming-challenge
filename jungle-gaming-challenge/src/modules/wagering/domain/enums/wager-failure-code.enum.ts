export enum WagerFailureCode {
  InsufficientFunds = 'INSUFFICIENT_FUNDS',
  ReversalWouldCauseNegativeBalance = 'REVERSAL_WOULD_CAUSE_NEGATIVE_BALANCE',

  ReferenceNotFound = 'REFERENCE_NOT_FOUND',
  InvalidReferenceType = 'INVALID_REFERENCE_TYPE',
  ReferenceScopeMismatch = 'REFERENCE_SCOPE_MISMATCH',
  ReferenceAmountMismatch = 'REFERENCE_AMOUNT_MISMATCH',
  ReferenceAlreadyReversed = 'REFERENCE_ALREADY_REVERSED',
  ReferenceNotProcessed = 'REFERENCE_NOT_PROCESSED',

  CurrencyMismatch = 'CURRENCY_MISMATCH',
  WalletNotFound = 'WALLET_NOT_FOUND',

  PermanentInfrastructureFailure = 'PERMANENT_INFRASTRUCTURE_FAILURE',
}