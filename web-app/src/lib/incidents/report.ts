/**
 * The report of an incident cut for the render request (rest-api.adoc, The Report): the request renders at most 65,536
 * bytes of source, so the report is rendered one level-2 section at a time.
 */

/** One piece of the report that is rendered on its own. */
export interface ReportSection {
  /** A key of the piece: its position and its heading. */
  key: string;
  /** The AsciiDoc source of the piece, its heading one level lower than the report's. */
  source: string;
}

/**
 * Cuts the AsciiDoc of a report into its level-2 sections. The title of the report (`= …`) is the sheet's heading and is
 * left out, and the headings go one level down, so that the report stands under the heading of its own section.
 *
 * @param adoc the AsciiDoc source of the report
 * @returns the sections, in order; a text before the first section is a section of its own
 */
export function reportSections(adoc: string): ReportSection[] {
  const lines = adoc.split(/\r?\n/);
  const pieces: string[][] = [];
  for (const line of lines) {
    if (/^= /.test(line) && pieces.length === 0) continue;
    if (/^== /.test(line)) {
      pieces.push(['=' + line]);
    } else {
      if (pieces.length === 0) pieces.push([]);
      pieces[pieces.length - 1].push(line);
    }
  }
  return pieces
    .map((piece) => piece.join('\n').trim())
    .filter((source) => source !== '')
    .map((source, position) => ({ key: `${position}:${source.slice(0, 40)}`, source }));
}
