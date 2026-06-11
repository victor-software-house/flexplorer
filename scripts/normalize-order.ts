#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * normalize-order.ts — Normalize `order` frontmatter values to sequential 1..N
 *
 * Usage:
 *   bun scripts/normalize-order.ts <vault-folder-path>
 *
 * Reads all .md files in the given folder, sorts them by their current `order`
 * value (items without `order` sort last, then by filename), and rewrites the
 * frontmatter `order` field to sequential 1, 2, 3, …N.
 *
 * Handles:
 * - Missing `order` fields (appended after the last existing field)
 * - Duplicate `order` values (stable-sorted, then renumbered)
 * - Non-numeric `order` values (treated as missing)
 * - Folder notes (same-name .md inside a subfolder) included in the sequence
 *
 * Dry-run by default. Pass --write to actually modify files.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/
const ORDER_LINE_RE = /^order:\s*(.*)$/m

interface FileEntry {
	path: string
	name: string
	currentOrder: number | null
	content: string
}

async function collectEntries(folderPath: string): Promise<FileEntry[]> {
	const entries: FileEntry[] = []
	const dirEntries = await readdir(folderPath, { withFileTypes: true })

	for (const ent of dirEntries) {
		let mdPath: string

		if (ent.isFile() && ent.name.endsWith('.md') && ent.name !== 'AGENTS.md') {
			mdPath = join(folderPath, ent.name)
		} else if (ent.isDirectory()) {
			// Folder note: same-name .md inside the subfolder
			const folderNotePath = join(folderPath, ent.name, `${ent.name}.md`)
			try {
				await readFile(folderNotePath, 'utf8')
				mdPath = folderNotePath
			} catch {
				continue
			}
		} else {
			continue
		}

		const content = await readFile(mdPath, 'utf8')
		const fmMatch = content.match(FRONTMATTER_RE)
		let currentOrder: number | null = null

		if (fmMatch) {
			const orderMatch = fmMatch[1].match(ORDER_LINE_RE)
			if (orderMatch) {
				const parsed = Number(orderMatch[1].trim())
				if (Number.isFinite(parsed)) currentOrder = parsed
			}
		}

		entries.push({
			path: mdPath,
			name: basename(mdPath, '.md'),
			currentOrder,
			content,
		})
	}

	return entries
}

function sortEntries(entries: FileEntry[]): FileEntry[] {
	return entries.slice().sort((a, b) => {
		const aOrd = a.currentOrder ?? Number.MAX_SAFE_INTEGER
		const bOrd = b.currentOrder ?? Number.MAX_SAFE_INTEGER
		if (aOrd !== bOrd) return aOrd - bOrd
		return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
	})
}

function rewriteOrder(content: string, newOrder: number): string {
	const fmMatch = content.match(FRONTMATTER_RE)
	if (!fmMatch) {
		// No frontmatter — prepend one with order
		return `---\norder: ${newOrder}\n---\n${content}`
	}

	const fmBody = fmMatch[1]
	if (ORDER_LINE_RE.test(fmBody)) {
		// Replace existing order line
		const newFm = fmBody.replace(ORDER_LINE_RE, `order: ${newOrder}`)
		return content.replace(FRONTMATTER_RE, `---\n${newFm}\n---`)
	}

	// No order field — insert after last line of frontmatter
	const newFm = `${fmBody}\norder: ${newOrder}`
	return content.replace(FRONTMATTER_RE, `---\n${newFm}\n---`)
}

async function main() {
	const args = process.argv.slice(2)
	const doWrite = args.includes('--write')
	const folderPath = resolve(args.find(a => !a.startsWith('--')) ?? '.')

	console.log(`Folder: ${folderPath}`)
	console.log(`Mode: ${doWrite ? 'WRITE' : 'dry-run (pass --write to apply)'}`)
	console.log()

	const entries = await collectEntries(folderPath)
	if (entries.length === 0) {
		console.log('No .md files found.')
		return
	}

	const sorted = sortEntries(entries)

	let changed = 0
	for (let i = 0; i < sorted.length; i++) {
		const entry = sorted[i]
		const newOrder = i + 1
		const marker = entry.currentOrder === newOrder ? ' ' : '→'
		const oldStr = entry.currentOrder !== null ? String(entry.currentOrder) : '—'

		console.log(`  ${marker} ${oldStr.padStart(4)} → ${newOrder}  ${entry.name}`)

		if (entry.currentOrder !== newOrder) {
			changed++
			if (doWrite) {
				const newContent = rewriteOrder(entry.content, newOrder)
				await writeFile(entry.path, newContent, 'utf8')
			}
		}
	}

	console.log()
	console.log(`${sorted.length} files, ${changed} would change.`)
	if (doWrite && changed > 0) console.log(`${changed} files written.`)
}

main().catch(err => {
	console.error(err)
	process.exit(1)
})
