/** Formatting only: retain decimal digits and the original numeric string for saving. */
export const groupAmount = (raw: string) => {
  const [integer = '', decimal] = raw.split('.');
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (decimal === undefined ? '' : '.' + decimal);
};
export const validAmountDraft = (value: string) => /^\d{0,15}(\.\d{0,4})?$/.test(value);
export const amountCaret = (rawPrefix: string, formatted: string) => {
  let count = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] !== ',') count++;
    if (count >= rawPrefix.length) return rawPrefix.length ? i + 1 : 0;
  }
  return formatted.length;
};
