/**
 * Deterministic Strided Sampling
 *
 * Per BIBSS Spec §10. When input exceeds sampleSize, selects a
 * deterministic subset using strided sampling with no randomness.
 */

export interface SampleResult<T> {
  sampled: T[];
  applied: boolean;
  inputSize: number;
}

/**
 * Apply deterministic strided sampling per Spec §10.1.
 *
 * 1. Always include the first floor(sampleSize / 2) records.
 * 2. For the remaining records, compute stride and select every stride-th.
 *
 * If records.length <= sampleSize, all records are returned unchanged.
 */
export function sample<T>(records: T[], sampleSize: number): SampleResult<T> {
  const inputSize = records.length;

  if (inputSize <= sampleSize) {
    return { sampled: records, applied: false, inputSize };
  }

  const firstHalf = Math.floor(sampleSize / 2);
  const secondHalf = sampleSize - firstHalf;
  const sampled: T[] = records.slice(0, firstHalf);

  // Stride through the remaining records
  const remaining = inputSize - firstHalf;
  const stride = Math.floor(remaining / secondHalf);

  for (let i = 0; i < secondHalf; i++) {
    const index = firstHalf + i * stride;
    if (index < inputSize) {
      sampled.push(records[index]);
    }
  }

  return { sampled, applied: true, inputSize };
}
