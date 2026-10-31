import { releaseDirectory } from './output.mjs';

export function installerConfig(repository, version) {
  const publisher = process.env.WINDOWS_PUBLISHER_NAME;
  return {
    appId: 'io.homebaseviewer.desktop',
    productName: 'Homebase Designer',
    executableName: 'Homebase Designer',
    icon: 'assets/branding/icon.png',
    directories: { output: releaseDirectory(version), buildResources: 'assets/branding' },
    artifactName: 'Homebase-Designer-Setup-${version}.${ext}',
    files: [
      'dist/**/*',
      'electron/**/*',
      'docs/**/*',
      'notices/**/*',
      'README.md',
      'THIRD-PARTY.md',
      'LICENSE',
      'package.json',
    ],
    asar: true,
    extraResources: [{ from: 'electron/homebase-open.json', to: 'homebase-open.json' }],
    extraMetadata: {
      description: 'Fortnite STW homebase designer and blueprint editor',
      author: 'Homebase Designer contributors',
    },
    publish: repository
      ? [{ provider: 'github', ...repository, releaseType: 'release', vPrefixedTagName: false }]
      : null,
    win: {
      target: [{ target: 'nsis', arch: ['x64'] }],
      ...(publisher ? { publisherName: publisher } : {}),
    },
    nsis: {
      guid: '7b147886-61f4-4b70-b8b7-d98b3ee1cabf',
      oneClick: false,
      perMachine: false,
      allowElevation: false,
      allowToChangeInstallationDirectory: false,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: 'Homebase Designer',
      uninstallDisplayName: 'Homebase Designer',
      deleteAppDataOnUninstall: false,
      differentialPackage: true,
    },
  };
}
