#!/usr/bin/env bun
/**
 * version-bump.ts — Sync version from package.json into manifest.json and versions.json.
 *
 * Obsidian community plugins require:
 *   - manifest.json.version matches the release tag
 *   - versions.json maps each plugin version to its minAppVersion
 *
 * This runs as part of `bun run version` (after `changeset version`).
 */

const pkg = await Bun.file('package.json').json() as { version: string }
const version = pkg.version

// Sync manifest.json
const manifest = await Bun.file('manifest.json').json() as Record<string, unknown>
const { minAppVersion } = manifest as { minAppVersion: string }
manifest.version = version
await Bun.write('manifest.json', JSON.stringify(manifest, null, '\t') + '\n')

// Sync versions.json — add entry if missing
const versions = await Bun.file('versions.json').json() as Record<string, string>
if (!(version in versions)) {
	versions[version] = minAppVersion
	await Bun.write('versions.json', JSON.stringify(versions, null, '\t') + '\n')
}

console.log(`version-bump: ${version} (minAppVersion: ${minAppVersion})`)
