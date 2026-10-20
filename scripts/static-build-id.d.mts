export function computeStaticBuildId(
  projectRoot?: string,
  publicEnv?: Readonly<Record<string, string | undefined>>,
): Promise<string>;
