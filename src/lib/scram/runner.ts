import type { FTANode, FTAEdge } from "@/store/ftaStore";
import type { AnalysisResults, CcfGroup, RunOptions } from "@/types/fta";
import { serializeToOpenPsaXml } from "@/lib/openpsa/serializer";
import { parseScramReport } from "@/lib/scram/reportParser";
import { AnalysisResourceLimitError } from "@/lib/analysis/resourceLimitError";
import { runBuiltinEngine, cancelBuiltinEngineRun, BuiltinEngineCancelledError } from "@/lib/analysis/engineWorkerClient";

export function isTauriEnv(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function detectScramBinary(): Promise<string | null> {
  if (!isTauriEnv()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string | null>("find_scram_binary");
  } catch {
    return null;
  }
}

/** Path to the SCRAM CLI shipped inside the app bundle itself
 * (`src-tauri/resources/scram/bin/`, declared in `tauri.conf.json`'s
 * `bundle.resources`) — a known-good build plus its full runtime DLL
 * closure and RelaxNG schema files, laid out to match the install
 * directory shape SCRAM itself expects (`schemaDirFor`). This is what
 * makes the app "plug and play" with zero setup: no PATH entry, no
 * pointing at a folder, nothing to install — SCRAM Just Works the moment
 * the app is. Returns `null` outside Tauri or if the resource is missing
 * (e.g. a non-Windows build that hasn't had its own binary bundled yet). */
export async function getBundledScramPath(): Promise<string | null> {
  if (!isTauriEnv()) return null;
  try {
    const { resourceDir, join } = await import("@tauri-apps/api/path");
    const { exists } = await import("@tauri-apps/plugin-fs");
    const dir = await resourceDir();
    // `resourceDir()` resolves differently between `tauri dev` (where it's
    // the cargo target dir itself, so the copied tree is one level deeper
    // at `<target>/resources/...`) and an installed build (where it already
    // points straight at the `resources/` folder) — trying both handles
    // either layout without caring which one this run is.
    for (const base of [await join(dir, "resources"), dir]) {
      for (const name of ["scram.exe", "scram"]) {
        const candidate = await join(base, "scram", "bin", name);
        if (await exists(candidate).catch(() => false)) return candidate;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Kills the currently-running scram child process, if any — backs the
 * Stop button. Safe to call even when nothing is running (returns
 * `false`); the Rust side tracks at most one PID at a time (this app never
 * runs two analyses concurrently — `isRunning` already prevents that). */
export async function cancelScramRun(): Promise<boolean> {
  if (!isTauriEnv()) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("cancel_scram");
  } catch {
    return false;
  }
}

/** Current app process memory (RSS, bytes) — `null` outside Tauri (no
 * process to report on) or if the call fails for any reason, so a caller
 * can just skip displaying it rather than surface a spurious error for
 * what's a nice-to-have status readout. */
export async function getMemoryUsage(): Promise<number | null> {
  if (!isTauriEnv()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<number>("get_memory_usage");
  } catch {
    return null;
  }
}

/** Thrown when a SCRAM run finishes successfully but its report is too
 * large to safely read into the webview's JS heap and parse — surfaced as
 * a dedicated modal (not just a toast) with enough context to explain why
 * and what to adjust, rather than letting `readTextFile` + the XML parser
 * balloon memory until the whole app crashes. */
export class ScramOutputTooLargeError extends AnalysisResourceLimitError {
  readonly fileSizeBytes: number;

  constructor(fileSizeBytes: number, nodeCount: number, options: RunOptions) {
    super(
      `SCRAM report is ${(fileSizeBytes / 1e6).toFixed(0)} MB — too large to load safely.`,
      nodeCount,
      `Report file: ${(fileSizeBytes / 1e6).toFixed(1)} MB (limit ${(MAX_SAFE_REPORT_BYTES / 1e6).toFixed(0)} MB) · limit-order ${options.limitOrder} · cut-off ${options.cutOff}`
    );
    this.fileSizeBytes = fileSizeBytes;
    this.name = "ScramOutputTooLargeError";
  }
}

/** Above this, the report is refused rather than read — chosen well under
 * typical webview heap limits (Chromium's per-renderer default is usually
 * a few GB, but a raw file read is followed by full-document XML parsing,
 * which multiplies peak memory several times over the file's own size). */
const MAX_SAFE_REPORT_BYTES = 150 * 1024 * 1024;

/** A minimal-but-complete Open-PSA MEF fault tree — just enough to satisfy
 * schema validation (an `or` gate needs 2+ arguments) — used purely to
 * smoke-test a candidate SCRAM binary in `validateScramBinary` below. */
const SCRAM_SMOKE_TEST_XML = `<?xml version="1.0"?>
<opsa-mef>
  <define-fault-tree name="FT">
    <define-gate name="TOP">
      <or>
        <basic-event name="E1"/>
        <basic-event name="E2"/>
      </or>
    </define-gate>
  </define-fault-tree>
  <model-data>
    <define-basic-event name="E1"><float value="0.1"/></define-basic-event>
    <define-basic-event name="E2"><float value="0.1"/></define-basic-event>
  </model-data>
</opsa-mef>
`;

const SCRAM_SCHEMA_FILE_NAMES = ["input.rng", "project.rng", "report.rng"];

/** SCRAM resolves its own RelaxNG schema files relative to the *running
 * binary's* location — `<install_dir>/share/scram/{input,project,report}.rng`,
 * where `install_dir` is the binary's own parent-of-parent directory (see
 * `env.cc`'s `install_dir()`: `program_location().parent_path().parent_path()`,
 * i.e. `bin/scram.exe` → `bin` → install root). A real installed layout
 * (`make install`, a packaged release, the mingw64 package) always has this
 * pairing correct. But the single most common way someone ends up with a
 * *broken* SCRAM binary is exactly the "plug and play" case this exists to
 * support: clone the repo, run `cmake --build .` and never run
 * `cmake --install .` (or `ninja install`) — which produces a perfectly
 * good binary in `build/bin/` with **no** matching `build/share/scram/`,
 * since populating that is what the install step does. The real schema
 * files still exist, untouched, at `<repo-root>/share/*.rng` (verified
 * against a real local build+no-install checkout) — they just never got
 * copied to where the binary looks for them. */
async function schemaDirFor(binaryPath: string): Promise<string> {
  const { dirname, join } = await import("@tauri-apps/api/path");
  const binDir = await dirname(binaryPath);
  const installDir = await dirname(binDir);
  return join(installDir, "share", "scram");
}

/** Looks for `<repo-root>/share/*.rng` (the source-tree layout, unnested
 * under a `scram/` subfolder) starting from the binary's own directory and
 * walking upward a few levels, and copies them into the exact spot SCRAM
 * itself expects (`schemaDirFor`). Only ever adds files that are otherwise
 * missing — never touches an install that already has its own schema
 * files, however they got there. Returns whether a repair was actually
 * made (so the caller knows whether a retry is worth attempting). */
async function healMissingSchemaFiles(binaryPath: string): Promise<boolean> {
  const { dirname, join } = await import("@tauri-apps/api/path");
  const { exists, mkdir, copyFile } = await import("@tauri-apps/plugin-fs");

  const targetDir = await schemaDirFor(binaryPath);
  const targetInput = await join(targetDir, "input.rng");
  if (await exists(targetInput).catch(() => false)) return false; // already has its own — nothing to heal

  let candidateDir = await dirname(binaryPath);
  for (let level = 0; level < 5; level++) {
    candidateDir = await dirname(candidateDir);
    const candidateShare = await join(candidateDir, "share");
    const candidateInput = await join(candidateShare, "input.rng");
    if (await exists(candidateInput).catch(() => false)) {
      await mkdir(targetDir, { recursive: true }).catch(() => {});
      let copiedAny = false;
      for (const fileName of SCRAM_SCHEMA_FILE_NAMES) {
        const from = await join(candidateShare, fileName);
        if (!(await exists(from).catch(() => false))) continue;
        const to = await join(targetDir, fileName);
        try {
          await copyFile(from, to);
          copiedAny = true;
        } catch {
          // Best-effort — if even one file fails to copy, validation below
          // will just fail again and report the original error, no worse
          // off than not having tried.
        }
      }
      return copiedAny;
    }
  }
  return false;
}

/** Confirms a path actually launches as a *working* SCRAM binary — not just
 * an executable that exists and responds to `--version`. `--version` only
 * prints a string; it never touches SCRAM's RelaxNG schema files
 * (`share/scram/input.rng` etc, resolved by SCRAM itself relative to the
 * binary's own install layout — see its `env.cc`). A binary copied out of
 * a build directory without its paired `share/` folder responds to
 * `--version` just fine and then fails every real run with
 * `xmlRelaxNGParse: could not load .../input.rng` — exactly what was
 * happening here: a stale manually-picked path to an incomplete local
 * build kept re-validating as "working" every launch. Running a real
 * `--validate` pass against a tiny embedded model exercises the same
 * schema-loading path a real analysis does, so a binary missing its data
 * files is caught right here instead of failing on every actual run.
 *
 * If that first pass fails with SCRAM's specific "can't find my schema
 * files" signature, `healMissingSchemaFiles` gets one attempt to find and
 * copy them in from a sibling source-tree `share/` folder before giving up
 * — turning "clone + build, forget to install" from a dead end into
 * something that actually works, which is the whole point of a folder
 * picker that's supposed to be "point at it and go". */
export async function validateScramBinary(path: string): Promise<boolean> {
  if (!isTauriEnv()) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const { tempDir, join } = await import("@tauri-apps/api/path");
    const { writeTextFile, remove } = await import("@tauri-apps/plugin-fs");

    const dir = await tempDir();
    const smokeTestPath = await join(dir, `fta-scram-smoketest-${Date.now()}.xml`);
    await writeTextFile(smokeTestPath, SCRAM_SMOKE_TEST_XML);
    try {
      const result = await invoke<{ success: boolean; stderr: string }>("run_scram", {
        binary: path,
        args: ["--validate", smokeTestPath],
        cwd: undefined,
      });
      if (result.success) return true;

      if (isBrokenInstallError(result.stderr) && (await healMissingSchemaFiles(path))) {
        const retried = await invoke<{ success: boolean }>("run_scram", {
          binary: path,
          args: ["--validate", smokeTestPath],
          cwd: undefined,
        });
        return retried.success;
      }
      return false;
    } finally {
      await remove(smokeTestPath).catch(() => {});
    }
  } catch {
    return false;
  }
}

const SCRAM_BINARY_NAMES = ["scram-cli", "scram", "scram-cli.exe", "scram.exe"];

// Directories that are either huge and irrelevant (VCS history, package/
// dependency caches, build-tool intermediate output) or just noise for this
// search — skipped outright rather than walked into. Deliberately broad:
// people point this picker at all sorts of folders, not just a clean SCRAM
// checkout — accidentally pointing it at an unrelated large project (a
// Rust `target/` alone can be multiple gigabytes) shouldn't make the search
// crawl gigabytes of files. `build`/`bin`/`lib`/`share` are NOT skipped —
// that's exactly where a real SCRAM binary and its schema files live.
const SKIP_DIR_NAMES = new Set([
  ".git",
  ".github",
  ".hg",
  ".svn",
  "node_modules",
  ".vs",
  ".vscode",
  ".idea",
  "CMakeFiles",
  "_deps", // CMake FetchContent's downloaded-dependency trees — can be huge
  "target", // Rust/Java/Maven build output
  "dist",
  "out",
  ".next",
  ".nuxt",
  ".cache",
  ".pytest_cache",
  ".tox",
  "__pycache__",
  "venv",
  ".venv",
  "vendor",
  ".gradle",
  ".m2",
]);

/** Hard ceiling on how long the whole search may run, regardless of depth
 * or how many directories it's visited — the depth limit and skip-list
 * above handle the *common* slow cases, but there's no bounding a folder
 * picker against every possible directory structure someone might point it
 * at, and the search running directly on though the UI awaits it (there's
 * no cancel button on a folder picker) means an unbounded walk is a real
 * "the app looks frozen" risk, not just a slow no-op. */
const FOLDER_SEARCH_BUDGET_MS = 8000;

/** Depth-first-per-branch, breadth-parallel search for a working SCRAM
 * binary under `dir`. Siblings at each level are scanned concurrently
 * (`Promise.all`) rather than one at a time — a wide-but-shallow tree (a
 * typical project root) used to pay for every sibling's full recursive
 * subtree sequentially before even starting the next one; scanning them
 * together cuts wall-clock time roughly to the depth of the *slowest*
 * branch instead of the sum of all of them. `deadline` (a
 * `performance.now()` timestamp) is threaded through every recursive call
 * so the whole search can bail out cleanly mid-walk once the time budget
 * above is spent, from wherever it currently is — not just checked once at
 * the top. */
async function walkForScramBinary(dir: string, depthRemaining: number, deadline: number): Promise<string | null> {
  if (depthRemaining < 0 || performance.now() > deadline) return null;
  const { readDir } = await import("@tauri-apps/plugin-fs");
  const { join } = await import("@tauri-apps/api/path");

  let entries;
  try {
    entries = await readDir(dir);
  } catch {
    return null; // unreadable (permissions, race with deletion, etc.) — just skip it
  }

  const subdirNames: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) {
      if (!SKIP_DIR_NAMES.has(entry.name)) subdirNames.push(entry.name);
      continue;
    }
    if (entry.isFile && SCRAM_BINARY_NAMES.includes(entry.name)) {
      const candidate = await join(dir, entry.name);
      if (await validateScramBinary(candidate)) return candidate;
    }
  }

  if (performance.now() > deadline) return null;

  const subdirResults = await Promise.all(
    subdirNames.map(async (name) => walkForScramBinary(await join(dir, name), depthRemaining - 1, deadline))
  );
  return subdirResults.find((r): r is string => r !== null) ?? null;
}

/** Given a folder the user picked, finds a working SCRAM binary in it —
 * either directly inside (a folder containing the binary itself) or nested
 * a few levels down (pointing at a git-cloned source checkout, where the
 * built binary sits under something like `build/bin/`). Bounded by both a
 * depth limit and a hard wall-clock budget (`FOLDER_SEARCH_BUDGET_MS`) — a
 * folder picker that can silently run for minutes (or hang) on the wrong
 * folder is not "point and go", it's "point and hope". */
export async function findScramInFolder(folder: string): Promise<string | null> {
  const deadline = performance.now() + FOLDER_SEARCH_BUDGET_MS;
  return walkForScramBinary(folder, 6, deadline);
}

function buildScramArgs(
  inputPath: string,
  outputPath: string,
  options: RunOptions,
  hasCcfGroups: boolean
): string[] {
  const args = [inputPath, "--output", outputPath];
  args.push(`--${options.algorithm}`);
  if (options.probability) args.push("--probability");
  if (options.importance) args.push("--importance");
  if (options.uncertainty) {
    args.push("--uncertainty");
    args.push("--num-trials", String(options.numTrials));
  }
  if (options.primeImplicants) args.push("--prime-implicants");
  // Without --ccf, SCRAM silently ignores every <define-CCF-group> in the
  // model (verified live: same model, same probability numbers, no
  // <ccf-event> in the report) rather than erroring — so CCF groups the
  // user configured would appear to have zero effect unless this is set.
  if (hasCcfGroups) args.push("--ccf");
  args.push("--mission-time", String(options.missionTime));
  args.push("--limit-order", String(options.limitOrder));
  args.push("--cut-off", String(options.cutOff));
  return args;
}

export interface RunOutcome {
  results: AnalysisResults;
  engineSource: "builtin" | "scram-cli";
  rawStdout?: string;
  rawStderr?: string;
  /** True when the run ended because the user hit Stop — the caller should
   * just acknowledge that, not treat `results` (the pre-run empty/previous
   * state) as a real outcome or fall back to the built-in engine, which
   * could be just as slow on the same model. */
  cancelled?: boolean;
  /** True when SCRAM failed in the specific "binary present but its
   * install is incomplete/misplaced" way (missing RelaxNG schema files —
   * see `validateScramBinary`'s doc comment). `validateScramBinary` should
   * catch this before a binary is ever selected, but this is the fallback
   * signal for a path that changed on disk *after* being validated (an
   * install moved, or a `share/` folder got deleted). The caller uses this
   * to drop a stale manually-picked path rather than keep retrying it every
   * run. */
  brokenScramInstall?: boolean;
}

/** SCRAM's own error text when it can't find its RelaxNG schema files next
 * to the binary (see `validateScramBinary`'s doc comment for why this
 * happens) — matched against stderr to tell "installation is broken" apart
 * from an ordinary model-validation or crash failure. */
function isBrokenInstallError(stderr: string): boolean {
  return stderr.includes("xmlRelaxNGParse") || stderr.includes("could not load");
}

/**
 * Runs fault tree analysis. When executing inside the Tauri shell with a
 * discoverable `scram` / `scram-cli` binary on PATH, this shells out to the
 * real SCRAM engine for computation and best-effort-parses its XML report.
 * Otherwise (plain browser preview, or no SCRAM binary installed) it falls
 * back to the built-in JS analysis engine so the UI stays fully functional.
 */
export async function runAnalysis(
  nodes: FTANode[],
  edges: FTAEdge[],
  options: RunOptions,
  scramBinaryPath: string | null,
  ccfGroups: CcfGroup[] = []
): Promise<RunOutcome> {
  if (isTauriEnv() && scramBinaryPath) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { tempDir, join } = await import("@tauri-apps/api/path");
      const { writeTextFile, readTextFile, exists, size } = await import("@tauri-apps/plugin-fs");

      const dir = await tempDir();
      const stamp = Date.now();
      const inputPath = await join(dir, `fta-model-${stamp}.xml`);
      const outputPath = await join(dir, `fta-report-${stamp}.xml`);

      const xml = serializeToOpenPsaXml(nodes, edges, { ccfGroups });
      await writeTextFile(inputPath, xml);

      const args = buildScramArgs(inputPath, outputPath, options, ccfGroups.length > 0);
      const runResult = await invoke<{
        success: boolean;
        exit_code: number | null;
        stdout: string;
        stderr: string;
        cancelled: boolean;
      }>("run_scram", { binary: scramBinaryPath, args, cwd: dir });

      if (runResult.cancelled) {
        // Deliberately stopped — don't fall back to the built-in engine
        // (it could easily be just as slow/heavy on the same model) and
        // don't report it as a failure; the caller just acknowledges it.
        return {
          results: { algorithm: options.algorithm, cutSets: [], importance: [], warnings: [], runAt: new Date().toISOString() },
          engineSource: "scram-cli",
          cancelled: true,
        };
      }

      if (runResult.success && (await exists(outputPath))) {
        const reportSize = await size(outputPath);
        if (reportSize > MAX_SAFE_REPORT_BYTES) {
          throw new ScramOutputTooLargeError(reportSize, nodes.length, options);
        }
        const reportXml = await readTextFile(outputPath);
        const results = parseScramReport(reportXml, options.algorithm);
        results.missionTime = options.missionTime;
        return {
          results,
          engineSource: "scram-cli",
          rawStdout: runResult.stdout,
          rawStderr: runResult.stderr,
        };
      }

      // SCRAM failed or produced no report; fall back but surface why.
      const brokenInstall = isBrokenInstallError(runResult.stderr);
      const fallback = await runBuiltinEngine(nodes, edges, options, ccfGroups);
      fallback.warnings.unshift(
        brokenInstall
          ? "The configured SCRAM CLI install is missing its schema files (share/scram/) — showing built-in engine results instead. Re-select the SCRAM location, or point at a complete install."
          : `SCRAM CLI run failed (exit ${runResult.exit_code ?? "?"}); showing built-in engine results instead.`
      );
      return {
        results: fallback,
        engineSource: "builtin",
        rawStdout: runResult.stdout,
        rawStderr: runResult.stderr,
        brokenScramInstall: brokenInstall,
      };
    } catch (err) {
      // A resource-limit failure (too-large report, or the built-in
      // engine's own cut-set-explosion cap — the fallback call just below
      // can throw the latter) is its own dedicated failure mode: let it
      // propagate to the caller for a proper "can't run this safely" modal
      // instead of silently retrying on the built-in engine, which would
      // face the exact same combinatorial blow-up in the webview's own
      // (more constrained) JS heap.
      if (err instanceof AnalysisResourceLimitError) throw err;
      if (err instanceof BuiltinEngineCancelledError) {
        return {
          results: { algorithm: options.algorithm, cutSets: [], importance: [], warnings: [], runAt: new Date().toISOString() },
          engineSource: "builtin",
          cancelled: true,
        };
      }
      const fallback = await runBuiltinEngine(nodes, edges, options, ccfGroups);
      fallback.warnings.unshift(
        `SCRAM invocation error: ${err instanceof Error ? err.message : String(err)}. Showing built-in engine results.`
      );
      return { results: fallback, engineSource: "builtin" };
    }
  }

  try {
    const results = await runBuiltinEngine(nodes, edges, options, ccfGroups);
    return { results, engineSource: "builtin" };
  } catch (err) {
    if (err instanceof BuiltinEngineCancelledError) {
      return {
        results: { algorithm: options.algorithm, cutSets: [], importance: [], warnings: [], runAt: new Date().toISOString() },
        engineSource: "builtin",
        cancelled: true,
      };
    }
    throw err;
  }
}

/** Backs the Stop button — cancels whichever engine is currently running.
 * Both are safe to call unconditionally: `cancelScramRun` no-ops (returns
 * `false`) if no SCRAM child process is tracked, and `cancelBuiltinEngineRun`
 * no-ops if no worker is active. Exactly one of the two will ever actually
 * be running at once (`isRunning` in the store prevents concurrent runs). */
export async function cancelRun(): Promise<boolean> {
  const builtinCancelled = cancelBuiltinEngineRun();
  const scramCancelled = await cancelScramRun();
  return builtinCancelled || scramCancelled;
}
