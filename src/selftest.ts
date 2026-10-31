/*
 * Headless self-test, enabled with GOBLIN_IDE_SELFTEST=<project folder>.
 * Exercises the real backend (files, engine runs, check, freeze, terminal,
 * background image) inside the running app and writes results to the IDE log
 * (~/Library/Logs/com.goblinpp.ide/goblin-ide.log). Never active otherwise.
 */
import { fs, settingsApi } from './platform/tauri'
import { openProject } from './actions'
import { useAppStore } from './stores/appStore'
import { useEditorStore } from './stores/editorStore'
import { useLanguageStore } from './stores/languageStore'
import { useProjectStore } from './stores/projectStore'
import { useRunStore } from './stores/runStore'
import { useTerminalStore } from './stores/terminalStore'
import { getTerminalText } from './components/TerminalPanel'
import { resolveBackgroundUrl } from './components/BackgroundDialog'
import { join } from './util/path'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const log = (msg: string) => settingsApi.log(`SELFTEST ${msg}`)

export async function runSelfTest(project: string): Promise<void> {
  const fail: string[] = []
  const check = (name: string, ok: boolean, detail = '') => { void log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) fail.push(name) }
  try {
    await openProject(project)
    const tree = useProjectStore.getState().tree
    check('project.open', useProjectStore.getState().root === project && tree.length > 0, `${tree.length} entries`)
    const engine = useLanguageStore.getState().engine
    check('engine.resolve', !!engine?.path, `${engine?.path} (${engine?.source}) ${engine?.version}`)
    const lang = useLanguageStore.getState()
    check('language.folder', lang.status === 'found' && lang.functions.length > 200, `${lang.languageSource} ${lang.functions.length} functions, ${lang.units.length} units`)

    const editor = useEditorStore.getState()
    const el = join(project, 'electrical.gbl')
    await editor.openPath(el)
    check('file.open', useEditorStore.getState().tabs.some((t) => t.path === el))
    await sleep(300)
    const syms = useLanguageStore.getState().symbolsByPath[el] ?? []
    check('language.symbols', syms.filter((s) => s.kind === 'seal').length === 10, `${syms.length} symbols, ${syms.filter((s) => s.kind === 'seal').length} seals`)

    // Legacy trig → G302 from both the local parser and the engine's check.
    const legacy = join(project, 'legacy.gbl')
    await editor.openPath(legacy)
    await sleep(200)
    await useLanguageStore.getState().checkFile(legacy)
    const diags = useEditorStore.getState().diagnostics.filter((d) => d.file === legacy)
    check('check.g302', diags.some((d) => d.code === 'G302' && d.source === 'check') && diags.some((d) => d.line === 2), diags.map((d) => `${d.source}:${d.code}@${d.line}:${d.column}`).join(' '))

    // Parse error position mapping.
    const bad = join(project, 'selftest_bad.gbl')
    await fs.writeText(bad, 'x = 5\ny = x +\nprint(y)\n')
    await editor.openPath(bad)
    await useLanguageStore.getState().checkFile(bad)
    const badDiags = useEditorStore.getState().diagnostics.filter((d) => d.file === bad && d.source === 'check')
    check('check.parse-error', badDiags.some((d) => d.code === 'G002' && d.line === 2), badDiags.map((d) => `${d.code}@${d.line}:${d.column} ${d.message.slice(0, 60)}`).join(' | '))

    // New file + save + modify + save.
    const nf = join(project, 'selftest_new.gbl')
    await fs.writeText(nf, '# created by selftest\nvalue = 1\nprint("value = {value}")\n')
    await editor.openPath(nf)
    useEditorStore.getState().updateContent(nf, '# created by selftest\nvalue = 2\nprint("value = {value}")\nseal value\n')
    const saved = await useEditorStore.getState().save(nf)
    const onDisk = await fs.readText(nf)
    check('file.save', saved === nf && onDisk.includes('value = 2') && onDisk.includes('seal value'))

    // Real run.
    useAppStore.getState().showBottomTab('run')
    const run = await useRunStore.getState().run('run', { file: nf, silent: true })
    check('run.pass', run?.status === 'PASS' && !!run.runDir && (run.receipt?.sealed_artifacts?.length ?? 0) === 1, `${run?.status} ${run?.runDir} seals=${run?.receipt?.sealed_artifacts?.length} out=${useRunStore.getState().output.filter((l) => l.kind === 'stdout').map((l) => l.text).join(' / ').slice(0, 120)}`)
    const printed = useRunStore.getState().output.some((l) => l.kind === 'stdout' && l.text === 'value = 2')
    check('run.stdout', printed)
    const elRun = await useRunStore.getState().run('run', { file: el, silent: true })
    check('run.electrical', elRun?.status === 'PASS' && (elRun.receipt?.sealed_artifacts?.length ?? 0) === 10 && elRun.profile === 'GO_PARANOID', `${elRun?.status} seals=${elRun?.receipt?.sealed_artifacts?.length} profile=${elRun?.profile} postflight=${elRun?.summary.PARANOID_POSTFLIGHT}`)

    // Failing run surfaces the engine error.
    const badRun = await useRunStore.getState().run('run', { file: bad, silent: true })
    check('run.error', badRun?.status === 'MACHINERY_FAIL' && badRun.error?.code === 'G002', `${badRun?.status} ${badRun?.error?.code} ${badRun?.error?.title}`)

    // Layout: the Run output must get real height inside the native window.
    const rect = (sel: string) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width) } }
    const m = { win: [window.innerWidth, window.innerHeight], middle: rect('.app-middle'), col: rect('.editor-col'), host: rect('.editor-host'), wrap: rect('.bottom-wrap'), panel: rect('.bottom-panel'), out: rect('.run-output') }
    check('layout.run-output', (m.out?.h ?? 0) >= 72 && (m.panel?.h ?? 0) === (m.wrap?.h ?? -1) && (m.col?.h ?? 0) === (m.middle?.h ?? -1), JSON.stringify(m))

    // Verify the PASS run.
    if (run?.runDir) {
      await useRunStore.getState().verifyRun(run.runDir)
      const v = useRunStore.getState().history.find((h) => h.runDir === run.runDir)?.verify
      check('verify.pass', !!v?.verified, `${v?.status} ${v?.checks.length} checks`)
    }

    // Freeze + status on a scratch copy.
    const fz = join(project, 'selftest_freeze.gbl')
    await fs.writeText(fz, 'GO_PARANOID\n\nmass = 1 kg\nenergy = mass * c^2\nprint("E = {energy}")\nseal energy\n')
    await editor.openPath(fz)
    await useRunStore.getState().freezeCurrent()
    const st = useRunStore.getState().fileStatus[fz]
    check('freeze.status', !!st?.frozen && (await fs.exists(`${fz}.freeze.json`)), `${st?.state} ${st?.classification}`)
    check('freeze.tab-flag', !!useEditorStore.getState().tabs.find((t) => t.path === fz)?.frozen)

    // Evidence scan + audit ledger.
    await useRunStore.getState().scanRuns()
    check('evidence.scan', useRunStore.getState().runDirs.length >= 3, `${useRunStore.getState().runDirs.length} RUN_DIRs`)
    await useRunStore.getState().auditLedgerRefresh(false)
    check('audit.ledger', useRunStore.getState().auditLedger?.status === 'PASS', JSON.stringify(useRunStore.getState().auditLedger))

    // Terminal: real PTY with goblin++ on PATH.
    useAppStore.getState().showBottomTab('terminal')
    const tid = useTerminalStore.getState().create(project)
    await sleep(1800)
    useTerminalStore.getState().queueCommand(tid, 'echo IDE_TERM_$((20+22)); goblin++ --version; pwd')
    await sleep(2500)
    const text = getTerminalText(tid, 60)
    check('terminal.echo', text.includes('IDE_TERM_42'), text.replace(/\n+/g, ' ⏎ ').slice(-300))
    check('terminal.goblin-on-path', /goblin\+\+ 0\.1\.0/.test(text))
    check('terminal.cwd', text.includes('testproject'))

    // Search.
    const hits = await fs.search({ root: project, query: 'ee_current', include: ['*.gbl'] })
    check('search.find-in-files', hits.length >= 1, `${hits.length} hits`)

    // Background image from disk + bundled.
    const img = '/Users/turnipresearchlibrary/Documents/goblin++ IDE/default-workspace/background_image.png'
    if (await fs.exists(img)) {
      const url = await resolveBackgroundUrl({ path: img, opacity: 0.4, fit: 'cover', blur: 0, dim: 0 })
      check('background.file', !!url && url.startsWith('data:image/png;base64,') && url.length > 100000, `${url?.length} chars`)
    }
    const bundled = await resolveBackgroundUrl({ path: 'bundled:squirrel', opacity: 0.4, fit: 'cover', blur: 0, dim: 0 })
    check('background.bundled', bundled === '/background_image.png')
    const docs = await useLanguageStore.getState().readDoc('MATH.md')
    check('docs.read', !!docs && docs.text.length > 500, `${docs?.text.length} chars`)
  } catch (e) {
    fail.push('exception')
    await log(`EXCEPTION ${e instanceof Error ? e.stack ?? e.message : String(e)}`)
  }
  await log(`DONE ${fail.length === 0 ? 'ALL PASS' : `FAILED: ${fail.join(', ')}`}`)
}
