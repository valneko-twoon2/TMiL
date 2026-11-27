//! プロセスの、sysinfo では取れない様子（効率モード・分離・GPU エンジン）。
//!
//! Windows では、Chrome や Edge のように自分で効率モード（EcoQoS）に入るプロセスもあるので、
//! 本家と同じく OS から読む。PowerShell を毎回起動すると重いので、1 つを動かし続けて
//! 決まった間隔で聞く（効率モードと分離は `GetProcessInformation` と `GetTokenInformation`、
//! GPU エンジンはパフォーマンス カウンター `\GPU Engine(*)\Utilization Percentage`）。
//! 開けないプロセス（管理者として動くもの）は、効率モードと分離が分からない。

use std::collections::HashMap;
use std::time::Duration;

/// 聞き直す間隔。
pub const SAMPLE_INTERVAL: Duration = Duration::from_secs(2);
/// 1 回の答えの終わりの印。
pub const END_MARK: &str = "TASKMANAGERLITE_END";

/// プロセスの様子。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ProcessFlags {
    /// 効率モード（EcoQoS）に入っている
    pub efficient: bool,
    /// `AppContainer` の中で動いている
    pub app_container: bool,
    /// いちばん使っている GPU エンジン（`GPU 0 - 3D` のような本家の書き方）
    pub gpu_engine: Option<String>,
}

/// カウンターのインスタンス名（`pid_1_luid_..._phys_0_eng_0_engtype_3D`）から、PID と本家の書き方のエンジン名を取り出す。
pub fn parse_engine(instance: &str) -> Option<(u32, String)> {
    let pid = instance
        .strip_prefix("pid_")?
        .split('_')
        .next()?
        .parse()
        .ok()?;
    let phys = instance
        .split("_phys_")
        .nth(1)?
        .split('_')
        .next()
        .filter(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()))?;
    let kind = instance
        .split("_engtype_")
        .nth(1)
        .filter(|k| !k.is_empty())?;
    Some((pid, format!("GPU {phys} - {kind}")))
}

/// スクリプトの 1 回分の答えを読む。
/// - `P<TAB>PID<TAB>印`（`E` 効率モード、`A` `AppContainer`）
/// - `G<TAB>インスタンス名<TAB>使用率`（使用率が 0 より大きいものだけ）
pub fn parse(output: &str) -> HashMap<u32, ProcessFlags> {
    let mut flags: HashMap<u32, ProcessFlags> = HashMap::new();
    let mut busiest: HashMap<u32, f64> = HashMap::new();
    for line in output.lines() {
        let mut fields = line.trim_end_matches('\r').split('\t');
        match fields.next() {
            Some("P") => {
                let Some(pid) = fields.next().and_then(|p| p.trim().parse().ok()) else {
                    continue;
                };
                let marks = fields.next().unwrap_or_default();
                let entry = flags.entry(pid).or_default();
                entry.efficient = marks.contains('E');
                entry.app_container = marks.contains('A');
            }
            Some("G") => {
                let Some((pid, engine)) = fields.next().and_then(parse_engine) else {
                    continue;
                };
                let Some(value) = fields
                    .next()
                    .and_then(|v| v.trim().parse::<f64>().ok())
                    .filter(|v| v.is_finite() && *v > 0.0)
                else {
                    continue;
                };
                if busiest.get(&pid).is_some_and(|best| *best >= value) {
                    continue;
                }
                busiest.insert(pid, value);
                flags.entry(pid).or_default().gpu_engine = Some(engine);
            }
            _ => {}
        }
    }
    flags
}

/// 動かし続けるスクリプト。1 行受け取るたびに今の様子を出し、[`END_MARK`] で区切る。
pub const WINDOWS_SCRIPT: &str = r#"$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
public static class TaskManagerLiteFlags {
    [DllImport("kernel32.dll")]
    static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")]
    static extern bool GetProcessInformation(IntPtr handle, int infoClass, ref Throttling info, uint size);
    [DllImport("advapi32.dll")]
    static extern bool OpenProcessToken(IntPtr handle, uint access, out IntPtr token);
    [DllImport("advapi32.dll")]
    static extern bool GetTokenInformation(IntPtr token, int infoClass, out uint value, uint length, out uint returned);
    [DllImport("pdh.dll", CharSet = CharSet.Unicode)]
    static extern int PdhOpenQuery(string source, IntPtr user, out IntPtr query);
    [DllImport("pdh.dll", CharSet = CharSet.Unicode)]
    static extern int PdhAddEnglishCounter(IntPtr query, string path, IntPtr user, out IntPtr counter);
    [DllImport("pdh.dll")]
    static extern int PdhCollectQueryData(IntPtr query);
    [DllImport("pdh.dll", CharSet = CharSet.Unicode)]
    static extern int PdhGetFormattedCounterArray(IntPtr counter, uint format, ref uint size, out uint count, IntPtr items);
    [StructLayout(LayoutKind.Sequential)]
    struct Throttling { public uint Version; public uint ControlMask; public uint StateMask; }
    [StructLayout(LayoutKind.Sequential)]
    struct CounterItem { public IntPtr Name; public uint Status; public uint Padding; public double Value; }
    const uint QueryLimited = 0x1000;
    const uint TokenQuery = 0x0008;
    const int PowerThrottling = 4;
    const int TokenIsAppContainer = 29;
    const uint FormatDouble = 0x200;
    const int MoreData = unchecked((int)0x800007D2);
    static IntPtr query = IntPtr.Zero, counter = IntPtr.Zero;
    public static void Open() {
        if (PdhOpenQuery(null, IntPtr.Zero, out query) != 0) { query = IntPtr.Zero; return; }
        if (PdhAddEnglishCounter(query, @"\GPU Engine(*)\Utilization Percentage", IntPtr.Zero, out counter) != 0) counter = IntPtr.Zero;
        PdhCollectQueryData(query);
    }
    static void Flags(StringBuilder output) {
        foreach (var process in Process.GetProcesses()) {
            uint pid = (uint)process.Id;
            process.Dispose();
            IntPtr handle = OpenProcess(QueryLimited, false, pid);
            if (handle == IntPtr.Zero) continue;
            try {
                var state = new Throttling { Version = 1 };
                bool efficient = GetProcessInformation(handle, PowerThrottling, ref state, (uint)Marshal.SizeOf(state))
                    && (state.ControlMask & 1) != 0 && (state.StateMask & 1) != 0;
                bool container = false;
                IntPtr token;
                if (OpenProcessToken(handle, TokenQuery, out token)) {
                    uint value, returned;
                    container = GetTokenInformation(token, TokenIsAppContainer, out value, 4, out returned) && value != 0;
                    CloseHandle(token);
                }
                if (efficient || container) output.Append("P\t").Append(pid).Append('\t').Append(efficient ? "E" : "").Append(container ? "A" : "").Append('\n');
            } finally { CloseHandle(handle); }
        }
    }
    static void Engines(StringBuilder output) {
        if (counter == IntPtr.Zero || PdhCollectQueryData(query) != 0) return;
        uint size = 0, count;
        if (PdhGetFormattedCounterArray(counter, FormatDouble, ref size, out count, IntPtr.Zero) != MoreData) return;
        IntPtr buffer = Marshal.AllocHGlobal((int)size);
        try {
            if (PdhGetFormattedCounterArray(counter, FormatDouble, ref size, out count, buffer) != 0) return;
            int itemSize = Marshal.SizeOf(typeof(CounterItem));
            for (int i = 0; i < count; i++) {
                var item = (CounterItem)Marshal.PtrToStructure(buffer + i * itemSize, typeof(CounterItem));
                if (item.Status != 0 || item.Value <= 0) continue;
                output.Append("G\t").Append(Marshal.PtrToStringUni(item.Name)).Append('\t')
                    .Append(item.Value.ToString(System.Globalization.CultureInfo.InvariantCulture)).Append('\n');
            }
        } finally { Marshal.FreeHGlobal(buffer); }
    }
    public static string Sample() {
        var output = new StringBuilder();
        Flags(output);
        Engines(output);
        return output.ToString();
    }
}
'@
[TaskManagerLiteFlags]::Open()
while ($null -ne [Console]::In.ReadLine()) {
    [Console]::Out.Write([TaskManagerLiteFlags]::Sample())
    [Console]::Out.WriteLine('TASKMANAGERLITE_END')
    [Console]::Out.Flush()
}
"#;

/// 裏で様子を聞き続け、最新の答えを覚えておく。捨てると PowerShell も止める。
#[derive(Debug)]
pub struct FlagsSampler {
    latest: std::sync::Arc<std::sync::Mutex<HashMap<u32, ProcessFlags>>>,
    /// 捨てると裏のスレッドに止まるよう伝わる
    _stop: std::sync::mpsc::Sender<()>,
}

impl FlagsSampler {
    /// 裏のスレッドを起こす。起こせなければ、いつも空の答えを返す。
    pub fn start() -> Self {
        let latest = std::sync::Arc::new(std::sync::Mutex::new(HashMap::new()));
        let (stop, stopped) = std::sync::mpsc::channel();
        spawn_worker(std::sync::Arc::clone(&latest), stopped);
        Self {
            latest,
            _stop: stop,
        }
    }

    /// そのプロセスの様子（分からなければ既定値）。
    pub fn get(&self, pid: u32) -> ProcessFlags {
        self.latest
            .lock()
            .ok()
            .and_then(|map| map.get(&pid).cloned())
            .unwrap_or_default()
    }
}

#[cfg(windows)]
fn spawn_worker(
    latest: std::sync::Arc<std::sync::Mutex<HashMap<u32, ProcessFlags>>>,
    stopped: std::sync::mpsc::Receiver<()>,
) {
    use std::io::{BufRead, BufReader, Write};
    let _ = std::thread::Builder::new()
        .name("process-flags".to_owned())
        .spawn(move || {
            let Ok(mut child) = crate::powershell::spawn_persistent(WINDOWS_SCRIPT) else {
                return;
            };
            let (Some(mut input), Some(output)) = (child.stdin.take(), child.stdout.take()) else {
                let _ = child.kill();
                return;
            };
            let mut lines = BufReader::new(output).lines();
            // 捨てられる（Disconnected）か止めるよう言われるまで、間隔ごとに聞く
            while let Err(std::sync::mpsc::RecvTimeoutError::Timeout) =
                stopped.recv_timeout(SAMPLE_INTERVAL)
            {
                if writeln!(input, "sample")
                    .and_then(|()| input.flush())
                    .is_err()
                {
                    break;
                }
                let mut answer = String::new();
                let mut finished = false;
                for line in lines.by_ref() {
                    let Ok(line) = line else { break };
                    if line.trim_end() == END_MARK {
                        finished = true;
                        break;
                    }
                    answer.push_str(&line);
                    answer.push('\n');
                }
                if !finished {
                    break;
                }
                if let Ok(mut map) = latest.lock() {
                    *map = parse(&answer);
                }
            }
            let _ = child.kill();
            let _ = child.wait();
        });
}

/// Linux では取らない（効率モードと分離は Windows の仕組み）。
#[cfg(not(windows))]
fn spawn_worker(
    _latest: std::sync::Arc<std::sync::Mutex<HashMap<u32, ProcessFlags>>>,
    _stopped: std::sync::mpsc::Receiver<()>,
) {
}

#[cfg(test)]
mod tests {
    use super::*;

    mod equivalence {
        use super::*;

        #[test]
        fn engine_names_follow_task_manager() {
            assert_eq!(
                parse_engine("pid_19204_luid_0x00000000_0x13C233D7_phys_0_eng_0_engtype_3D"),
                Some((19204, "GPU 0 - 3D".to_owned()))
            );
            assert_eq!(
                parse_engine("pid_7_luid_0x0_0x1_phys_1_eng_3_engtype_VideoDecode"),
                Some((7, "GPU 1 - VideoDecode".to_owned()))
            );
        }

        #[test]
        fn reads_flags_and_keeps_the_busiest_engine() {
            let flags = parse(
                "P\t10\tE\r\nP\t11\tA\nP\t12\tEA\n\
                 G\tpid_10_luid_0x0_0x1_phys_0_eng_4_engtype_Copy\t1.5\n\
                 G\tpid_10_luid_0x0_0x1_phys_0_eng_0_engtype_3D\t30.2\n\
                 G\tpid_10_luid_0x0_0x1_phys_0_eng_5_engtype_Compute\t2\n",
            );
            assert_eq!(
                flags[&10],
                ProcessFlags {
                    efficient: true,
                    app_container: false,
                    gpu_engine: Some("GPU 0 - 3D".to_owned()),
                }
            );
            assert!(flags[&11].app_container && !flags[&11].efficient);
            assert!(flags[&12].app_container && flags[&12].efficient);
        }

        #[test]
        fn script_answers_each_line_and_ends_with_the_mark() {
            assert!(WINDOWS_SCRIPT.contains("[Console]::In.ReadLine()"));
            assert!(WINDOWS_SCRIPT.contains(END_MARK));
            assert!(WINDOWS_SCRIPT.contains(r"\GPU Engine(*)\Utilization Percentage"));
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn broken_lines_are_skipped() {
            assert!(parse("").is_empty());
            assert!(parse("P\tx\tE\nQ\t1\tE\nG\tpid_1_phys_0_engtype_3D\tNaN\n").is_empty());
            assert!(
                parse("G\tpid_1_phys_0_engtype_3D\t0\nG\tpid_1_phys_0_engtype_3D\t-1\n").is_empty()
            );
            assert_eq!(parse("P\t5\t\n")[&5], ProcessFlags::default());
        }

        #[test]
        fn broken_engine_names() {
            assert_eq!(parse_engine(""), None);
            assert_eq!(parse_engine("pid_x_phys_0_engtype_3D"), None);
            assert_eq!(parse_engine("pid_1_luid_0x0"), None);
            assert_eq!(parse_engine("pid_1_phys__engtype_3D"), None);
            assert_eq!(parse_engine("pid_1_phys_0_engtype_"), None);
        }
    }

    #[cfg(windows)]
    mod system {
        use super::*;

        /// 動かし続ける PowerShell が答え、捨てると止まる（答えの中身は環境による）
        #[test]
        fn sampler_answers_and_stops() {
            let sampler = FlagsSampler::start();
            std::thread::sleep(SAMPLE_INTERVAL * 3);
            let _ = sampler.get(std::process::id());
            let map = sampler.latest.lock().expect("lock").clone();
            for flags in map.values() {
                if let Some(engine) = &flags.gpu_engine {
                    assert!(engine.starts_with("GPU "), "{engine}");
                }
            }
            drop(sampler);
        }
    }
}
