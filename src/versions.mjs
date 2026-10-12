// Cursor versions as numbers, so "every build since X" is a comparison rather
// than a list that has to grow with each release.
export function compareVersions(a, b) {
  const left = String(a).split('.').map(Number), right = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

export const atLeast = (version, minimum) => compareVersions(version, minimum) >= 0;
