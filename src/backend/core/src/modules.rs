//! プロセスが読み込んでいるモジュール（DLL・共有ライブラリ）の一覧。リソース モニターの CPU の表に使う。
//!
//! 読むだけで状態を持たないので状態機械は通さない。
//! - Windows: PowerShell の `(Get-Process -Id <pid>).Modules`（権限や 32/64 ビットの違いで読めないものがある）
//! - Linux: `/proc/<pid>/maps` に出てくるファイル

use crate::model::ModuleInfo;

/// 一覧の数の上限。
pub const MAX_MODULES: usize = 2000;

fn file_name(path: &str) -> &str {
    path.rsplit(['/', '\\']).next().unwrap_or(path)
}

/// Windows: モジュールを「名前・場所・バージョン」のタブ区切りで 1 行ずつ書くスクリプト。
pub fn windows_script(pid: u32) -> String {
    format!(
        "$ErrorActionPreference = 'Stop'; \
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); \
foreach ($m in (Get-Process -Id {pid}).Modules) {{ \
  [Console]::Out.WriteLine($m.ModuleName + [char]9 + $m.FileName + [char]9 + [string]$m.FileVersionInfo.FileVersion) \
}}"
    )
}

/// Windows のスクリプトの出力を読む。
pub fn parse_windows(output: &str) -> Vec<ModuleInfo> {
    output
        .lines()
        .filter_map(|line| {
            let mut fields = line.trim_end_matches('\r').split('\t');
            let name = fields.next()?.trim();
            let path = fields.next()?.trim();
            let version = fields.next().unwrap_or_default().trim();
            (!name.is_empty()).then(|| ModuleInfo {
                name: name.to_owned(),
                path: path.to_owned(),
                version: (!version.is_empty()).then(|| version.to_owned()),
            })
        })
        .take(MAX_MODULES)
        .collect()
}

/// `/proc/<pid>/maps` から、読み込まれているファイルを重ならないように出てきた順で取り出す。
pub fn parse_maps(maps: &str) -> Vec<ModuleInfo> {
    let mut seen: Vec<&str> = Vec::new();
    for line in maps.lines() {
        // 6 つ目の項目がファイルの場所（無い行や [heap] などは飛ばす）
        let Some(path) = line.split_whitespace().nth(5) else {
            continue;
        };
        if path.starts_with('/') && !path.starts_with("/dev/") && !seen.contains(&path) {
            seen.push(path);
        }
    }
    seen.into_iter()
        .take(MAX_MODULES)
        .map(|path| ModuleInfo {
            name: file_name(path).to_owned(),
            path: path.to_owned(),
            version: None,
        })
        .collect()
}

const DENIED: &str =
    "モジュールを読めませんでした。権限が足りないか、プロセスが終了している可能性があります。";

/// プロセスのモジュール。
#[cfg(windows)]
pub fn list(pid: u32) -> Result<Vec<ModuleInfo>, String> {
    crate::powershell::run(&windows_script(pid), "")
        .map(|out| parse_windows(&out))
        .map_err(|_| DENIED.to_owned())
}

/// プロセスのモジュール。
#[cfg(not(windows))]
pub fn list(pid: u32) -> Result<Vec<ModuleInfo>, String> {
    std::fs::read_to_string(format!("/proc/{pid}/maps"))
        .map(|maps| parse_maps(&maps))
        .map_err(|_| DENIED.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    mod equivalence {
        use super::*;

        #[test]
        fn windows_lines_have_name_path_and_version() {
            let out = "app.exe\tC:\\a\\app.exe\t1.2.3\r\nntdll.dll\tC:\\Windows\\SYSTEM32\\ntdll.dll\t\r\n";
            assert_eq!(
                parse_windows(out),
                vec![
                    ModuleInfo {
                        name: "app.exe".to_owned(),
                        path: r"C:\a\app.exe".to_owned(),
                        version: Some("1.2.3".to_owned()),
                    },
                    ModuleInfo {
                        name: "ntdll.dll".to_owned(),
                        path: r"C:\Windows\SYSTEM32\ntdll.dll".to_owned(),
                        version: None,
                    },
                ]
            );
        }

        #[test]
        fn maps_give_unique_files_in_order() {
            let maps = "55d0-55d1 r--p 00000000 08:01 100 /usr/bin/app\n\
55d1-55d2 r-xp 00001000 08:01 100 /usr/bin/app\n\
7f00-7f01 r--p 00000000 08:01 200 /usr/lib/libc.so.6\n\
7f02-7f03 rw-p 00000000 00:00 0 \n\
7ffd-7ffe rw-p 00000000 00:00 0 [stack]\n\
7f04-7f05 rw-s 00000000 00:05 300 /dev/zero (deleted)\n";
            let names: Vec<String> = parse_maps(maps).into_iter().map(|m| m.name).collect();
            assert_eq!(names, vec!["app".to_owned(), "libc.so.6".to_owned()]);
        }

        #[test]
        fn windows_script_reads_one_process() {
            let script = windows_script(42);
            assert!(script.contains("Get-Process -Id 42"));
            assert!(crate::powershell::is_safe_script(&script));
        }
    }

    mod boundary {
        use super::*;
        use std::fmt::Write as _;

        #[test]
        fn empty_outputs_are_empty() {
            assert_eq!(parse_windows(""), Vec::new());
            assert_eq!(parse_maps(""), Vec::new());
            assert_eq!(parse_windows("\tC:\\x.dll\t\n"), Vec::new());
        }

        #[test]
        fn list_is_capped() {
            let mut maps = String::new();
            for i in 0..MAX_MODULES + 5 {
                let _ = writeln!(maps, "0-1 r--p 0 0:0 {i} /lib/l{i}.so");
            }
            assert_eq!(parse_maps(&maps).len(), MAX_MODULES);
        }
    }

    mod system {
        use super::*;

        #[test]
        fn own_process_has_modules() {
            let list = list(std::process::id()).unwrap();
            assert_ne!(list.len(), 0);
            assert!(list.iter().all(|m| !m.path.is_empty()));
        }
    }
}
