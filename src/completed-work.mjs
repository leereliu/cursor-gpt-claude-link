export const completedWorkMarker = '/* cursor-links: completed work defaults closed */';

export function patchCompletedWork(source) {
  if (source.includes(completedWorkMarker)) throw new Error('Completed work patch already present');
  // Cursor only creates this disclosure after the work segment completes.
  // Active progress and the final assistant message use separate rows. Leave
  // the disclosure's own open state and manual onOpenChange callback intact.
  const anchor = /defaultOpen:([\w$]+)\.isLastTurn&&\1\.unfoldLatestTurn/g;
  const matches = [...source.matchAll(anchor)];
  if (matches.length !== 1) throw new Error('Completed work default anchor is not unique: ' + matches.length);
  return source.replace(anchor, 'defaultOpen:!1' + completedWorkMarker);
}
