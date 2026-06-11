#!/usr/bin/env bun
/**
 * release.ts — Create a GitHub Release with Obsidian plugin assets.
 *
 * Called by `changesets/action` publish step after the Version Packages PR
 * is merged. Reads the version from manifest.json, creates a git tag (if
 * missing), and creates a draft GitHub release with main.js, manifest.json,
 * and styles.css attached.
 *
 * Expects GITHUB_TOKEN in the environment.
 */

import { existsSync } from 'node:fs'
import { $ } from 'bun'

const manifest = await Bun.file('manifest.json').json() as { version: string }
const tag = manifest.version

// Check if this version was already released
const existing = await $`gh release view ${tag} --json tagName 2>/dev/null`.quiet().nothrow()
if (existing.exitCode === 0) {
	console.log(`release: ${tag} already exists, skipping`)
	process.exit(0)
}

// Create and push the tag if it doesn't exist
const tagExists = await $`git rev-parse refs/tags/${tag} 2>/dev/null`.quiet().nothrow()
if (tagExists.exitCode !== 0) {
	await $`git tag ${tag}`
	await $`git push origin ${tag}`
	console.log(`release: created tag ${tag}`)
}

// Build the assets list
const assets = ['main.js', 'manifest.json']
if (existsSync('styles.css')) assets.push('styles.css')

// Create a draft release
await $`gh release create ${tag} --title ${tag} --draft --generate-notes ${assets}`

console.log(`release: created draft release ${tag}`)
