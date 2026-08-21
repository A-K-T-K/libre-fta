use serde::{Deserialize, Serialize};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use sysinfo::{Pid, ProcessRefreshKind, RefreshKind, System};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct ScramRunResult {
    pub success: bool,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    /// True when the run ended because `cancel_scram` killed the process,
    /// so the frontend can tell "you stopped it" apart from "it failed".
    pub cancelled: bool,
}

#[derive(Default)]
struct RunSlot {
    pid: Option<u32>,
    cancelled: bool,
}

/// Tracks the currently-running scram child process's PID (if any) so a
/// separate `cancel_scram` invocation — which necessarily runs on a
/// different Tauri command call, with no access to the `Child` handle
/// living inside `run_scram`'s `spawn_blocking` closure — has something to
/// kill. A PID (not the `Child` itself) is what's shared: `Child` isn't
/// `Clone`, and `Arc<Mutex<RunSlot>>` is cheap to clone into the closure
/// while every command invocation still reads/writes the one shared slot
/// via `state.slot` (Tauri hands back the same managed instance every time).
#[derive(Default)]
pub struct RunState {
    slot: Arc<Mutex<RunSlot>>,
}

/// Locate the `scram` (or `scram-cli`) executable on PATH.
#[tauri::command]
fn find_scram_binary() -> Option<String> {
    for candidate in ["scram-cli", "scram"] {
        if let Ok(path) = which::which(candidate) {
            return Some(path.to_string_lossy().to_string());
        }
    }
    None
}

/// Run the SCRAM CLI engine with the given arguments and return captured output.
/// This blocks the calling thread, so it is spawned via `spawn_blocking` from
/// the async command below to avoid stalling the Tauri event loop.
fn run_scram_blocking(binary: String, args: Vec<String>, cwd: Option<String>, slot: Arc<Mutex<RunSlot>>) -> ScramRunResult {
    let mut cmd = Command::new(&binary);
    cmd.args(&args);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }

    let child: Child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return ScramRunResult {
                success: false,
                exit_code: None,
                stdout: String::new(),
                stderr: format!("Failed to launch '{binary}': {e}"),
                cancelled: false,
            }
        }
    };

    {
        let mut s = slot.lock().unwrap();
        s.pid = Some(child.id());
        s.cancelled = false;
    }

    let result = child.wait_with_output();

    let was_cancelled = {
        let mut s = slot.lock().unwrap();
        s.pid = None;
        std::mem::take(&mut s.cancelled)
    };

    match result {
        Ok(output) => ScramRunResult {
            success: output.status.success() && !was_cancelled,
            exit_code: output.status.code(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            cancelled: was_cancelled,
        },
        Err(e) => ScramRunResult {
            success: false,
            exit_code: None,
            stdout: String::new(),
            stderr: format!("Failed to read '{binary}' output: {e}"),
            cancelled: was_cancelled,
        },
    }
}

#[tauri::command]
async fn run_scram(
    binary: String,
    args: Vec<String>,
    cwd: Option<String>,
    state: State<'_, RunState>,
) -> Result<ScramRunResult, String> {
    let slot = state.slot.clone();
    tauri::async_runtime::spawn_blocking(move || run_scram_blocking(binary, args, cwd, slot))
        .await
        .map_err(|e| e.to_string())
}

/// Kills the currently-running scram process, if any. Returns `true` if a
/// process was actually found and killed.
#[tauri::command]
fn cancel_scram(state: State<'_, RunState>) -> bool {
    let pid = {
        let mut s = state.slot.lock().unwrap();
        s.cancelled = true;
        s.pid.take()
    };
    match pid {
        Some(pid) => {
            let mut sys =
                System::new_with_specifics(RefreshKind::new().with_processes(ProcessRefreshKind::new()));
            sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
            match sys.process(Pid::from_u32(pid)) {
                Some(process) => process.kill(),
                None => false,
            }
        }
        None => false,
    }
}

/// Current process (the whole app: webview host + Rust) resident memory,
/// in bytes — shown in the status bar so a runaway analysis is visible
/// before it OOMs the app outright.
#[tauri::command]
fn get_memory_usage() -> u64 {
    let mut sys =
        System::new_with_specifics(RefreshKind::new().with_processes(ProcessRefreshKind::new().with_memory()));
    let pid = sysinfo::get_current_pid().expect("failed to get current pid");
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);
    sys.process(pid).map(|p| p.memory()).unwrap_or(0)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(RunState::default())
        .invoke_handler(tauri::generate_handler![
            find_scram_binary,
            run_scram,
            cancel_scram,
            get_memory_usage
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
