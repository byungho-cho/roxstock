import { Prisma } from '../generated/prisma/index.js';

import { ApiError } from './api-error.js';

export function id(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new ApiError(400, 'INVALID_INPUT', `${fieldName} must be a positive integer string.`);
  }
  return BigInt(value);
}

export function positiveDecimal(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) {
    throw new ApiError(400, 'INVALID_INPUT', `${fieldName} must be a positive decimal string.`);
  }
  const result = new Prisma.Decimal(value);
  if (!result.isPositive()) {
    throw new ApiError(400, 'INVALID_INPUT', `${fieldName} must be greater than zero.`);
  }
  return result;
}

export function nonNegativeDecimal(value: unknown, fieldName: string) {
  if (value === undefined) return new Prisma.Decimal(0);
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) {
    throw new ApiError(400, 'INVALID_INPUT', `${fieldName} must be a non-negative decimal string.`);
  }
  return new Prisma.Decimal(value);
}

export function dateTime(value: unknown, fieldName: string) {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'INVALID_INPUT', `${fieldName} must be an ISO 8601 date-time string.`);
  }
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) {
    throw new ApiError(400, 'INVALID_INPUT', `${fieldName} must be a valid ISO 8601 date-time string.`);
  }
  return result;
}

export function optionalMemo(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 500) {
    throw new ApiError(400, 'INVALID_INPUT', 'memo must be at most 500 characters.');
  }
  return value;
}
