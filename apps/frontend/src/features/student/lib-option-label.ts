/** Options imported from a sheet often carry their own "a. " label; the page adds A/B/C/D itself. */
export const optionText = (option: string) => String(option ?? '').replace(/^\s*[A-Da-d][.)]\s+/, '');
