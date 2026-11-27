//! サービスの一覧と、開始・停止・再起動。
//!
//! 一覧は読むだけ、操作は OS に頼むだけで、状態を持たないので状態機械は通さない（スタートアップと同じ扱い）。
//! - Windows: 一覧は PowerShell の `Win32_Service`。操作は管理者として PowerShell を起動して行う（UAC の確認が出る）
//! - Linux: systemd の `systemctl`（操作で権限が要るときは polkit が確認を出す）

use std::collections::HashMap;

use crate::model::{ServiceAction, ServiceInfo, ServiceStartType, ServiceStatus};

/// サービス名の長さの上限（Windows の上限と同じ）。
const MAX_NAME_CHARS: usize = 256;

/// 操作するサービスの名前として受け付けるか。
/// 空・長すぎる・引用符や制御文字を含む・`-` で始まる（オプションと間違えられる）ものは断る。
pub fn validate_name(name: &str) -> Result<(), String> {
    let ok = !name.trim().is_empty()
        && name.chars().count() <= MAX_NAME_CHARS
        && !name.starts_with('-')
        && !name
            .chars()
            .any(|c| c.is_control() || matches!(c, '"' | '\'' | '`'));
    if ok {
        Ok(())
    } else {
        Err(format!("サービスの名前が正しくありません: {name}"))
    }
}

/// svchost のコマンドライン（`... svchost.exe -k netsvcs -p`）から、本家の「グループ」を取り出す。
pub fn group_of(path_name: &str) -> String {
    let mut words = path_name.split_whitespace();
    while let Some(word) = words.next() {
        if word.eq_ignore_ascii_case("-k") || word.eq_ignore_ascii_case("/k") {
            return words.next().unwrap_or_default().to_owned();
        }
    }
    String::new()
}

/// Windows の `State` を区分にする。
pub fn windows_status(state: &str) -> ServiceStatus {
    match state.trim() {
        "Running" => ServiceStatus::Running,
        "Stopped" => ServiceStatus::Stopped,
        "Paused" => ServiceStatus::Paused,
        "Start Pending" | "Continue Pending" => ServiceStatus::StartPending,
        "Stop Pending" | "Pause Pending" => ServiceStatus::StopPending,
        _ => ServiceStatus::Other,
    }
}

/// Windows の `StartMode` を区分にする。
pub fn windows_start_type(mode: &str) -> ServiceStartType {
    match mode.trim() {
        "Auto" | "Boot" | "System" => ServiceStartType::Automatic,
        "Manual" => ServiceStartType::Manual,
        "Disabled" => ServiceStartType::Disabled,
        _ => ServiceStartType::Other,
    }
}

/// Windows: サービスを 1 つ 1 行（名前・表示名・状態・PID・開始の種類・コマンドライン・説明をタブ区切り）で書くスクリプト。
pub const WINDOWS_LIST_SCRIPT: &str = "$ErrorActionPreference = 'Stop'; \
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); \
$tab = [string][char]9; \
foreach ($s in Get-CimInstance -ClassName Win32_Service -Property Name,DisplayName,State,ProcessId,StartMode,PathName,Description) { \
  $fields = @($s.Name, $s.DisplayName, $s.State, $s.ProcessId, $s.StartMode, $s.PathName, $s.Description) | ForEach-Object { (-split [string]$_) -join ' ' }; \
  [Console]::Out.WriteLine($fields -join $tab) \
}";

/// Windows のスクリプトの出力を読む。名前の無い行は飛ばす。
pub fn parse_windows(output: &str) -> Vec<ServiceInfo> {
    output
        .lines()
        .filter_map(|line| {
            let fields: Vec<&str> = line.trim_end_matches('\r').split('\t').collect();
            let field = |i: usize| fields.get(i).copied().unwrap_or_default().trim();
            let name = field(0);
            if name.is_empty() {
                return None;
            }
            Some(ServiceInfo {
                name: name.to_owned(),
                display_name: field(1).to_owned(),
                status: windows_status(field(2)),
                pid: field(3).parse().ok().filter(|p| *p != 0),
                start_type: windows_start_type(field(4)),
                group: group_of(field(5)),
                description: field(6).to_owned(),
            })
        })
        .collect()
}

/// Windows: サービスを操作する PowerShell のコマンド。
pub fn windows_action_command(name: &str, action: ServiceAction) -> String {
    let quoted = name.replace('\'', "''");
    match action {
        ServiceAction::Start => format!("Start-Service -Name '{quoted}'"),
        ServiceAction::Stop => format!("Stop-Service -Name '{quoted}' -Force"),
        ServiceAction::Restart => format!("Restart-Service -Name '{quoted}' -Force"),
    }
}

/// Windows: 管理者ならそのまま、そうでなければ管理者として PowerShell を起動して操作するスクリプト。
/// 管理者として起動する側には、操作を `-EncodedCommand` で渡す（引用符の扱いを気にしなくてよいように）。
pub fn windows_control_script(name: &str, action: ServiceAction) -> String {
    let command = windows_action_command(name, action);
    let inner = crate::powershell::encode_command(&format!(
        "$ErrorActionPreference = 'Stop'; try {{ {command} }} catch {{ exit 1 }}"
    ));
    format!(
        "$ErrorActionPreference = 'Stop'; \
$identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent(); \
if ($identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {{ {command} }} else {{ \
$p = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','{inner}' -Verb RunAs -Wait -WindowStyle Hidden -PassThru; \
exit $p.ExitCode }}"
    )
}

/// systemd の状態（ACTIVE と SUB）を区分にする。
pub fn systemd_status(active: &str, sub: &str) -> ServiceStatus {
    match (active, sub) {
        (_, "running") => ServiceStatus::Running,
        ("activating" | "reloading", _) => ServiceStatus::StartPending,
        ("deactivating", _) => ServiceStatus::StopPending,
        ("active", "exited") | ("inactive" | "failed", _) => ServiceStatus::Stopped,
        ("active", _) => ServiceStatus::Running,
        _ => ServiceStatus::Other,
    }
}

/// systemd の `UnitFileState` を区分にする。
pub fn systemd_start_type(state: &str) -> ServiceStartType {
    match state {
        "enabled" | "enabled-runtime" | "alias" => ServiceStartType::Automatic,
        "masked" | "masked-runtime" => ServiceStartType::Disabled,
        "" => ServiceStartType::Other,
        _ => ServiceStartType::Manual,
    }
}

/// `systemctl list-units --type=service --all --plain --no-legend` の 1 行。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnitLine {
    pub name: String,
    pub active: String,
    pub sub: String,
    pub description: String,
}

/// `systemctl list-units` の出力を読む（読み込めなかった印の `●` は飛ばす）。
pub fn parse_list_units(output: &str) -> Vec<UnitLine> {
    output
        .lines()
        .filter_map(|line| {
            let mut words = line.split_whitespace().skip_while(|w| *w == "●");
            let unit = words.next()?;
            let name = unit.strip_suffix(".service")?;
            let _load = words.next()?;
            let active = words.next()?;
            let sub = words.next()?;
            Some(UnitLine {
                name: name.to_owned(),
                active: active.to_owned(),
                sub: sub.to_owned(),
                description: words.collect::<Vec<_>>().join(" "),
            })
        })
        .collect()
}

/// `systemctl list-unit-files --type=service --no-legend` の出力を、名前 → 状態（`enabled` など）にする。
/// 名前だけでは動かせない雛形（`getty@.service`）は除く。
pub fn parse_unit_files(output: &str) -> HashMap<String, String> {
    output
        .lines()
        .filter_map(|line| {
            let mut words = line.split_whitespace();
            let name = words.next()?.strip_suffix(".service")?;
            let state = words.next()?;
            (!name.ends_with('@')).then(|| (name.to_owned(), state.to_owned()))
        })
        .collect()
}

/// `systemctl show --property=Id,MainPID ...` の出力を、名前 → 動いている PID にする。
pub fn parse_main_pids(output: &str) -> HashMap<String, u32> {
    output
        .split("\n\n")
        .filter_map(|block| {
            let value = |key: &str| {
                block
                    .lines()
                    .find_map(|l| l.strip_prefix(key)?.strip_prefix('='))
                    .unwrap_or_default()
                    .trim()
            };
            let name = value("Id").strip_suffix(".service")?;
            let pid: u32 = value("MainPID").parse().ok().filter(|p| *p != 0)?;
            Some((name.to_owned(), pid))
        })
        .collect()
}

/// systemd の 3 つの出力をまとめる。読み込まれていないサービス（無効なものなど）は停止として足す。
pub fn merge_systemd<S: std::hash::BuildHasher>(
    units: &[UnitLine],
    files: &HashMap<String, String, S>,
    pids: &HashMap<String, u32, S>,
) -> Vec<ServiceInfo> {
    let start_type = |name: &str| systemd_start_type(files.get(name).map_or("", String::as_str));
    let mut list: Vec<ServiceInfo> = units
        .iter()
        .map(|u| ServiceInfo {
            name: u.name.clone(),
            display_name: u.description.clone(),
            description: u.description.clone(),
            status: systemd_status(&u.active, &u.sub),
            pid: pids.get(&u.name).copied(),
            start_type: start_type(&u.name),
            group: String::new(),
        })
        .collect();
    for name in files.keys() {
        if !units.iter().any(|u| &u.name == name) {
            list.push(ServiceInfo {
                name: name.clone(),
                display_name: String::new(),
                description: String::new(),
                status: ServiceStatus::Stopped,
                pid: None,
                start_type: start_type(name),
                group: String::new(),
            });
        }
    }
    list
}

/// 動いているか、動き始め・止まりかけのユニット（PID を聞く相手）。
pub fn active_units(units: &[UnitLine]) -> Vec<String> {
    units
        .iter()
        .filter(|u| u.active != "inactive" && u.active != "failed")
        .map(|u| format!("{}.service", u.name))
        .collect()
}

/// systemctl に渡す操作の名前。
pub fn systemctl_verb(action: ServiceAction) -> &'static str {
    match action {
        ServiceAction::Start => "start",
        ServiceAction::Stop => "stop",
        ServiceAction::Restart => "restart",
    }
}

/// 名前の順に並べる（大文字小文字は区別しない）。
fn sorted(mut list: Vec<ServiceInfo>) -> Vec<ServiceInfo> {
    list.sort_by_key(|s| s.name.to_lowercase());
    list
}

/// サービスの一覧。
#[cfg(windows)]
pub fn list() -> Result<Vec<ServiceInfo>, String> {
    crate::powershell::run(WINDOWS_LIST_SCRIPT, "")
        .map(|out| sorted(parse_windows(&out)))
        .map_err(|e| format!("サービスの一覧を取れません: {e}"))
}

/// サービスを操作する。
#[cfg(windows)]
pub fn control(name: &str, action: ServiceAction) -> Result<(), String> {
    validate_name(name)?;
    crate::powershell::run_encoded(&windows_control_script(name, action), "")
        .map(|_| ())
        .map_err(|_| {
            "サービスを操作できませんでした。管理者の確認が取り消されたか、このサービスは操作できない可能性があります。"
                .to_owned()
        })
}

/// systemctl を動かして標準出力を返す。失敗したら理由を返す。
#[cfg(not(windows))]
fn systemctl(args: &[&str]) -> Result<String, String> {
    let output = std::process::Command::new("systemctl")
        .args(args)
        .output()
        .map_err(|e| format!("サービスの一覧を取れません（systemctl を起動できません）: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(format!(
            "サービスの一覧を取れません: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

/// サービスの一覧（読み込まれているものと、無効などで読み込まれていないもの）。
#[cfg(not(windows))]
pub fn list() -> Result<Vec<ServiceInfo>, String> {
    let units = parse_list_units(&systemctl(&[
        "list-units",
        "--type=service",
        "--all",
        "--plain",
        "--no-legend",
        "--no-pager",
    ])?);
    // ユニット ファイルと PID は、取れなくても一覧は出す
    let files = systemctl(&[
        "list-unit-files",
        "--type=service",
        "--no-legend",
        "--no-pager",
    ])
    .map(|out| parse_unit_files(&out))
    .unwrap_or_default();
    let active = active_units(&units);
    let pids = if active.is_empty() {
        HashMap::new()
    } else {
        let mut args = vec!["show", "--no-pager", "--property=Id,MainPID", "--"];
        args.extend(active.iter().map(String::as_str));
        systemctl(&args)
            .map(|out| parse_main_pids(&out))
            .unwrap_or_default()
    };
    Ok(sorted(merge_systemd(&units, &files, &pids)))
}

/// サービスを操作する。
#[cfg(not(windows))]
pub fn control(name: &str, action: ServiceAction) -> Result<(), String> {
    validate_name(name)?;
    let output = std::process::Command::new("systemctl")
        .args([systemctl_verb(action), name])
        .output()
        .map_err(|e| format!("systemctl を起動できません: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "サービスを操作できませんでした: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod equivalence {
        use super::*;

        #[test]
        fn windows_lines_become_services() {
            let out = "wuauserv\tWindows Update\tRunning\t1234\tManual\tC:\\WINDOWS\\system32\\svchost.exe -k netsvcs -p\t更新を行います。\r\n\
Spooler\tPrint Spooler\tStopped\t0\tAuto\tC:\\WINDOWS\\System32\\spoolsv.exe\t\r\n";
            let list = parse_windows(out);
            assert_eq!(list.len(), 2);
            let first = list.first().unwrap();
            assert_eq!(first.name, "wuauserv");
            assert_eq!(first.display_name, "Windows Update");
            assert_eq!(first.status, ServiceStatus::Running);
            assert_eq!(first.pid, Some(1234));
            assert_eq!(first.start_type, ServiceStartType::Manual);
            assert_eq!(first.group, "netsvcs");
            assert_eq!(first.description, "更新を行います。");
            let second = list.get(1).unwrap();
            assert_eq!(second.pid, None, "停止中の PID 0 は無し");
            assert_eq!(second.group, "");
            assert_eq!(second.start_type, ServiceStartType::Automatic);
        }

        #[test]
        fn windows_states_and_modes() {
            assert_eq!(windows_status("Paused"), ServiceStatus::Paused);
            assert_eq!(windows_status("Start Pending"), ServiceStatus::StartPending);
            assert_eq!(
                windows_status("Continue Pending"),
                ServiceStatus::StartPending
            );
            assert_eq!(windows_status("Stop Pending"), ServiceStatus::StopPending);
            assert_eq!(windows_status("Pause Pending"), ServiceStatus::StopPending);
            assert_eq!(windows_start_type("Disabled"), ServiceStartType::Disabled);
            assert_eq!(windows_start_type("Boot"), ServiceStartType::Automatic);
            assert_eq!(windows_start_type("System"), ServiceStartType::Automatic);
        }

        #[test]
        fn systemd_outputs_are_merged_into_services() {
            let units = parse_list_units(
                "ssh.service      loaded active   running OpenBSD Secure Shell server\n\
● bad.service      not-found inactive dead bad.service\n\
cups.service     loaded inactive dead    CUPS Scheduler\n\
dev-sda.device   loaded active   plugged /dev/sda\n",
            );
            assert_eq!(units.len(), 3);
            assert_eq!(units.get(1).map(|u| u.name.as_str()), Some("bad"));
            let files = parse_unit_files(
                "ssh.service     enabled  enabled\n\
cups.service    disabled enabled\n\
getty@.service  enabled  enabled\n\
nfs.service     masked   -\n",
            );
            assert!(!files.contains_key("getty@"), "雛形は除く");
            let pids =
                parse_main_pids("Id=ssh.service\nMainPID=812\n\nId=other.service\nMainPID=0\n");
            assert_eq!(active_units(&units), vec!["ssh.service".to_owned()]);
            let list = sorted(merge_systemd(&units, &files, &pids));
            let names: Vec<&str> = list.iter().map(|s| s.name.as_str()).collect();
            assert_eq!(names, vec!["bad", "cups", "nfs", "ssh"]);
            let ssh = list.iter().find(|s| s.name == "ssh").unwrap();
            assert_eq!(ssh.status, ServiceStatus::Running);
            assert_eq!(ssh.pid, Some(812));
            assert_eq!(ssh.start_type, ServiceStartType::Automatic);
            assert_eq!(ssh.display_name, "OpenBSD Secure Shell server");
            let cups = list.iter().find(|s| s.name == "cups").unwrap();
            assert_eq!(cups.status, ServiceStatus::Stopped);
            assert_eq!(cups.pid, None);
            assert_eq!(cups.start_type, ServiceStartType::Manual);
            // 読み込まれていないものは停止として足す
            let nfs = list.iter().find(|s| s.name == "nfs").unwrap();
            assert_eq!(nfs.status, ServiceStatus::Stopped);
            assert_eq!(nfs.start_type, ServiceStartType::Disabled);
            assert_eq!(nfs.display_name, "");
        }

        #[test]
        fn systemd_states_map_like_task_manager() {
            assert_eq!(systemd_status("active", "exited"), ServiceStatus::Stopped);
            assert_eq!(
                systemd_status("active", "listening"),
                ServiceStatus::Running
            );
            assert_eq!(
                systemd_status("activating", "start"),
                ServiceStatus::StartPending
            );
            assert_eq!(
                systemd_status("deactivating", "stop"),
                ServiceStatus::StopPending
            );
            assert_eq!(systemd_status("failed", "failed"), ServiceStatus::Stopped);
            assert_eq!(systemd_start_type("masked"), ServiceStartType::Disabled);
            assert_eq!(systemd_start_type("static"), ServiceStartType::Manual);
        }

        #[test]
        fn group_is_read_after_k() {
            assert_eq!(
                group_of(r"C:\Windows\system32\svchost.exe -k LocalServiceNetworkRestricted -p"),
                "LocalServiceNetworkRestricted"
            );
            assert_eq!(group_of(r"C:\a.exe /K grp"), "grp");
        }

        #[test]
        fn control_script_elevates_only_when_not_admin_and_quotes_name() {
            let script = windows_control_script("a'b", ServiceAction::Restart);
            assert!(script.contains("Restart-Service -Name 'a''b' -Force"));
            assert!(script.contains("-Verb RunAs"));
            assert!(script.contains("IsInRole"));
            assert_eq!(
                windows_action_command("x", ServiceAction::Start),
                "Start-Service -Name 'x'"
            );
            assert_eq!(
                windows_action_command("x", ServiceAction::Stop),
                "Stop-Service -Name 'x' -Force"
            );
            assert_eq!(systemctl_verb(ServiceAction::Stop), "stop");
            assert_eq!(systemctl_verb(ServiceAction::Restart), "restart");
            assert_eq!(systemctl_verb(ServiceAction::Start), "start");
        }

        #[test]
        fn ordinary_names_are_accepted() {
            assert!(validate_name("wuauserv").is_ok());
            assert!(validate_name("user@1000").is_ok());
            assert!(validate_name("Apple Mobile Device Service").is_ok());
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn dangerous_names_are_rejected() {
            for name in ["", "  ", "-force", "a\"b", "a'b", "a`b", "a\nb"] {
                assert!(validate_name(name).is_err(), "{name:?}");
            }
            assert!(validate_name(&"a".repeat(MAX_NAME_CHARS)).is_ok());
            assert!(validate_name(&"a".repeat(MAX_NAME_CHARS + 1)).is_err());
        }

        #[test]
        fn missing_fields_and_unknown_values() {
            let list = parse_windows("only-name\r\n\t\t\r\n");
            assert_eq!(list.len(), 1);
            let s = list.first().unwrap();
            assert_eq!(s.status, ServiceStatus::Other);
            assert_eq!(s.start_type, ServiceStartType::Other);
            assert_eq!(s.pid, None);
            assert_eq!(systemd_status("weird", "x"), ServiceStatus::Other);
            assert_eq!(systemd_start_type(""), ServiceStartType::Other);
        }

        #[test]
        fn group_without_value_is_empty() {
            assert_eq!(group_of("svchost.exe -k"), "");
            assert_eq!(group_of(""), "");
        }

        #[test]
        fn empty_outputs_are_empty_lists() {
            assert_eq!(parse_windows(""), Vec::new());
            assert_eq!(parse_list_units(""), Vec::new());
            assert!(parse_unit_files("").is_empty());
            assert!(parse_main_pids("").is_empty());
            assert_eq!(
                merge_systemd(&[], &HashMap::new(), &HashMap::new()),
                Vec::new()
            );
            assert_eq!(parse_list_units("short.service loaded\n"), Vec::new());
        }
    }

    mod system {
        use super::*;

        /// 実機のサービスが読め、名前の順に並んでいる（systemd が無い環境では失敗してよい）
        #[test]
        fn real_services_are_sorted_by_name() {
            if let Ok(list) = list() {
                let names: Vec<String> = list.iter().map(|s| s.name.to_lowercase()).collect();
                let mut expected = names.clone();
                expected.sort();
                assert_eq!(names, expected);
                if cfg!(windows) {
                    assert_ne!(list.len(), 0);
                }
            }
        }
    }
}
