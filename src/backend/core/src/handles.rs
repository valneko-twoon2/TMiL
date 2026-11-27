//! ファイルを開いているプロセスを探す（リソース モニターの「関連付けられたハンドル」）。
//!
//! 読むだけで状態を持たないので状態機械は通さない。
//! - Windows: Restart Manager（`RmGetList`）に、ファイルか、フォルダーの中のファイルを渡して聞く。
//!   場所は標準入力で渡す（スクリプトに埋め込まない）
//! - Linux: `/proc/<pid>/fd` のリンク先を、入れた文字を含むかで探す（大文字小文字は区別しない）

use crate::model::HandleInfo;

/// 結果の数の上限。
pub const MAX_HANDLES: usize = 2000;

/// Windows: フォルダーの中から調べるファイルの数の上限。
pub const MAX_FILES: usize = 5000;

/// Windows: これ以下のファイル数なら、ファイルごとに聞いてどのファイルかも出す。
/// 多いときはまとめて 1 回で聞き、場所には入れた場所を出す（ファイルごとだと遅いため）。
pub const PER_FILE_LIMIT: usize = 100;

/// 入れた場所が見つからないときにスクリプトが書く印。
const NOT_FOUND: &str = "TASKMANAGERLITE_NOT_FOUND";

/// 探す文字を整える（前後の空白と引用符を取る）。
pub fn normalize_query(query: &str) -> String {
    query.trim().trim_matches('"').trim().to_owned()
}

/// Windows: 標準入力の場所を開いているプロセスを「PID・場所」のタブ区切りで書くスクリプト。
pub fn windows_script() -> String {
    format!(
        r#"$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
public static class TaskManagerLiteRm {{
    [StructLayout(LayoutKind.Sequential)]
    struct UniqueProcess {{ public int Pid; public System.Runtime.InteropServices.ComTypes.FILETIME Start; }}
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct RmProcess {{
        public UniqueProcess Process;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string AppName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string ServiceName;
        public int AppType;
        public uint Status;
        public uint Session;
        [MarshalAs(UnmanagedType.Bool)] public bool Restartable;
    }}
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    static extern int RmStartSession(out uint session, int flags, StringBuilder key);
    [DllImport("rstrtmgr.dll")]
    static extern int RmEndSession(uint session);
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    static extern int RmRegisterResources(uint session, uint files, string[] names, uint apps, IntPtr appList, uint services, string[] serviceNames);
    [DllImport("rstrtmgr.dll")]
    static extern int RmGetList(uint session, out uint needed, ref uint count, [In, Out] RmProcess[] list, ref uint reasons);
    public static int[] Find(string[] files) {{
        uint session;
        int r = RmStartSession(out session, 0, new StringBuilder(64));
        if (r != 0) throw new Win32Exception(r);
        try {{
            r = RmRegisterResources(session, (uint)files.Length, files, 0, IntPtr.Zero, 0, null);
            if (r != 0) throw new Win32Exception(r);
            uint needed = 0, count = 0, reasons = 0;
            RmProcess[] list = null;
            r = RmGetList(session, out needed, ref count, null, ref reasons);
            while (r == 234) {{
                list = new RmProcess[needed];
                count = needed;
                r = RmGetList(session, out needed, ref count, list, ref reasons);
            }}
            if (r != 0) throw new Win32Exception(r);
            int[] pids = new int[count];
            for (int i = 0; i < count; i++) pids[i] = list[i].Process.Pid;
            return pids;
        }} finally {{
            RmEndSession(session);
        }}
    }}
}}
'@
$query = [Console]::In.ReadToEnd().Trim()
if (Test-Path -LiteralPath $query -PathType Container) {{
  $files = @(Get-ChildItem -LiteralPath $query -File -Recurse -Force -ErrorAction SilentlyContinue | Select-Object -First {MAX_FILES} | ForEach-Object {{ $_.FullName }})
}} elseif (Test-Path -LiteralPath $query -PathType Leaf) {{
  $files = @((Resolve-Path -LiteralPath $query).ProviderPath)
}} else {{
  [Console]::Error.WriteLine('{NOT_FOUND}')
  exit 3
}}
if ($files.Count -eq 0) {{ exit 0 }}
if ($files.Count -le {PER_FILE_LIMIT}) {{
  foreach ($f in $files) {{
    foreach ($p in [TaskManagerLiteRm]::Find(@($f))) {{ [Console]::Out.WriteLine([string]$p + [char]9 + $f) }}
  }}
}} else {{
  $root = (Resolve-Path -LiteralPath $query).ProviderPath
  foreach ($p in [TaskManagerLiteRm]::Find([string[]]$files)) {{ [Console]::Out.WriteLine([string]$p + [char]9 + $root) }}
}}
"#
    )
}

/// 結果の行を足す（同じ組は 1 つにし、上限で止める）。
fn push_unique(list: &mut Vec<HandleInfo>, pid: u32, path: &str) {
    if list.len() < MAX_HANDLES && !list.iter().any(|h| h.pid == pid && h.path == path) {
        list.push(HandleInfo {
            pid,
            path: path.to_owned(),
        });
    }
}

/// Windows のスクリプトの出力を読む。
pub fn parse_windows(output: &str) -> Vec<HandleInfo> {
    let mut list = Vec::new();
    for line in output.lines() {
        let Some((pid, path)) = line.trim_end_matches('\r').split_once('\t') else {
            continue;
        };
        if let Ok(pid) = pid.trim().parse::<u32>()
            && !path.trim().is_empty()
        {
            push_unique(&mut list, pid, path.trim());
        }
    }
    list
}

/// Windows のスクリプトが失敗したときの文言。
pub fn failure_message(error: &str, query: &str) -> String {
    if error.contains(NOT_FOUND) {
        format!("'{query}' が見つかりません。ファイルかフォルダーの場所を入れてください。")
    } else {
        "ハンドルを調べられませんでした。".to_owned()
    }
}

/// Linux: リンク先が探す文字を含むか（`query` は小文字にしたもの）。
pub fn matches(target: &str, query: &str) -> bool {
    target.to_lowercase().contains(query)
}

/// Linux: プロセスごとの開いているもの（PID とリンク先）から、探す文字を含むものを選ぶ。
pub fn select<'a>(
    entries: impl IntoIterator<Item = (u32, &'a str)>,
    query: &str,
) -> Vec<HandleInfo> {
    let query = query.to_lowercase();
    let mut list = Vec::new();
    for (pid, target) in entries {
        if list.len() >= MAX_HANDLES {
            break;
        }
        if matches(target, &query) {
            push_unique(&mut list, pid, target);
        }
    }
    list
}

/// 入れた場所を開いているプロセス。
#[cfg(windows)]
pub fn find(query: &str) -> Result<Vec<HandleInfo>, String> {
    let query = normalize_query(query);
    if query.is_empty() {
        return Ok(Vec::new());
    }
    crate::powershell::run_encoded(&windows_script(), &query)
        .map(|out| parse_windows(&out))
        .map_err(|e| failure_message(&e, &query))
}

/// 入れた文字を含むものを開いているプロセス。
#[cfg(not(windows))]
pub fn find(query: &str) -> Result<Vec<HandleInfo>, String> {
    let query = normalize_query(query);
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let proc = std::fs::read_dir("/proc").map_err(|e| format!("/proc を読めません: {e}"))?;
    let mut entries: Vec<(u32, String)> = Vec::new();
    for dir in proc.flatten() {
        let Some(pid) = dir.file_name().to_str().and_then(|s| s.parse::<u32>().ok()) else {
            continue;
        };
        // 権限の無いプロセスは読めないので飛ばす
        let Ok(fds) = std::fs::read_dir(dir.path().join("fd")) else {
            continue;
        };
        for fd in fds.flatten() {
            if let Ok(target) = std::fs::read_link(fd.path()) {
                entries.push((pid, target.to_string_lossy().into_owned()));
            }
        }
    }
    Ok(select(
        entries.iter().map(|(pid, t)| (*pid, t.as_str())),
        &query,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    mod equivalence {
        use super::*;

        #[test]
        fn windows_lines_have_pid_and_path() {
            let out = "120\tC:\\a\\b.txt\r\n4\tC:\\a\\c.log\r\n";
            assert_eq!(
                parse_windows(out),
                vec![
                    HandleInfo {
                        pid: 120,
                        path: r"C:\a\b.txt".to_owned(),
                    },
                    HandleInfo {
                        pid: 4,
                        path: r"C:\a\c.log".to_owned(),
                    },
                ]
            );
        }

        #[test]
        fn windows_script_reads_the_place_from_stdin() {
            let script = windows_script();
            assert!(script.contains("[Console]::In.ReadToEnd()"));
            assert!(script.contains("InputEncoding = [Text.UTF8Encoding]"));
            assert!(script.contains("-LiteralPath $query"));
            assert!(script.contains("RmGetList"));
        }

        #[test]
        fn not_found_has_its_own_message() {
            assert!(failure_message(NOT_FOUND, r"C:\x").contains(r"'C:\x' が見つかりません"));
            assert_eq!(
                failure_message("Access denied", r"C:\x"),
                "ハンドルを調べられませんでした。"
            );
        }

        #[test]
        fn linux_matches_ignore_case() {
            let entries = [
                (1, "/home/u/Report.TXT"),
                (2, "socket:[123]"),
                (3, "/home/u/report.txt"),
                (3, "/tmp/other"),
            ];
            let found = select(entries, "report");
            let pids: Vec<u32> = found.iter().map(|h| h.pid).collect();
            assert_eq!(pids, vec![1, 3]);
            assert_eq!(select(entries, "SOCKET").len(), 1);
        }

        #[test]
        fn quotes_and_spaces_are_removed() {
            assert_eq!(normalize_query("  \"C:\\a b\\c.txt\" "), r"C:\a b\c.txt");
            assert_eq!(normalize_query("/tmp/x"), "/tmp/x");
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn empty_and_broken_lines_are_ignored() {
            assert_eq!(parse_windows(""), Vec::new());
            assert_eq!(parse_windows("abc\tC:\\x\n12\t\nno tab\n"), Vec::new());
            assert_eq!(select([(1, "/a")], "zzz"), Vec::new());
            assert_eq!(normalize_query("   "), "");
            assert_eq!(find(" ").unwrap(), Vec::new());
        }

        #[test]
        fn same_pair_is_listed_once() {
            assert_eq!(parse_windows("1\tC:\\a\n1\tC:\\a\n2\tC:\\a\n").len(), 2);
            assert_eq!(select([(1, "/a"), (1, "/a")], "a").len(), 1);
        }

        #[test]
        fn list_is_capped() {
            let paths: Vec<String> = (0..MAX_HANDLES + 5).map(|i| format!("/f{i}")).collect();
            let found = select(paths.iter().map(|p| (1, p.as_str())), "/f");
            assert_eq!(found.len(), MAX_HANDLES);
        }
    }

    mod system {
        use super::*;

        #[test]
        fn own_open_file_is_found() {
            let tmp = crate::startup::test_support::TempDir::new("handles-held");
            let path = tmp.path().join("held.txt");
            let file = std::fs::File::create(&path).unwrap();
            let found = find(&path.to_string_lossy()).unwrap();
            // フォルダーを入れても、中の開いているファイルが見つかる
            let in_dir = find(&tmp.path().to_string_lossy()).unwrap();
            drop(file);
            assert!(
                in_dir
                    .iter()
                    .any(|h| h.pid == std::process::id() && h.path.ends_with("held.txt")),
                "フォルダーの中のファイルも見つかるはず: {in_dir:?}"
            );
            assert!(
                found.iter().any(|h| h.pid == std::process::id()),
                "自分が開いているファイルが見つかるはず: {found:?}"
            );
        }

        #[cfg(windows)]
        #[test]
        fn missing_place_is_an_error() {
            let error = find(r"C:\no\such\place\tml.txt").unwrap_err();
            assert!(error.contains("見つかりません"), "{error}");
        }
    }
}
