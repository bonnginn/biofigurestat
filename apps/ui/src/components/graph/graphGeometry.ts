export function violinDensityPath(
  values: readonly number[],
  x: number,
  yFor: (value: number) => number,
  halfWidth: number,
): string | null {
  if (values.length < 2) return null;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const observedRange = maximum - minimum;
  // A violin describes the density within the observed extent. In
  // particular, identical or nearly identical values must not manufacture a
  // one-sided tail above the largest measurement.
  if (observedRange <= Number.EPSILON) return null;
  const scale = Math.max(Math.abs(minimum), Math.abs(maximum), Number.EPSILON);
  const bandwidth = Math.max(observedRange / 7, scale * 0.01, 0.001);
  const samples = Array.from(
    { length: 24 },
    (_, index) => minimum + (observedRange * index) / 23,
  );
  const densities = samples.map((sample) =>
    values.reduce((sum, value) => {
      const z = (sample - value) / bandwidth;
      return sum + Math.exp(-0.5 * z * z);
    }, 0),
  );
  const maximumDensity = Math.max(...densities, 1);
  const right = samples.map(
    (sample, index) => `${x + (densities[index]! / maximumDensity) * halfWidth},${yFor(sample)}`,
  );
  const left = [...samples].reverse().map((sample, reverseIndex) => {
    const index = samples.length - 1 - reverseIndex;
    return `${x - (densities[index]! / maximumDensity) * halfWidth},${yFor(sample)}`;
  });
  return `M ${right[0]} L ${[...right.slice(1), ...left].join(" L ")} Z`;
}
