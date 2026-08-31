interface ArchiveNameBase {
  sourceName: string;
  variant: string;
  version: string;
}

type ArchiveNameOptions =
  | (ArchiveNameBase & { stock: true })
  | (ArchiveNameBase & { stock: false; reportedVersion: string | number });

/** Compose the filename used to publish and link a Kitchen archive. */
export function archiveFileName(options: ArchiveNameOptions): string {
  const reported = options.stock ? "" : `-r${options.reportedVersion}`;
  return `${options.sourceName}-${options.variant}${reported}-v${options.version}.zip`;
}
