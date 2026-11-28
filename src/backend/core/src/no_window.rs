//! 契約: Windows で、子プロセスにコンソール窓を出させずに起動する。
//! なぜ: 窓の無いアプリから `netstat` などを起動すると、そのたびに黒い窓が一瞬出る。

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// 契約: Windows でコンソールを持つ外部コマンドは、`Command::new` でなくこれで起動する。
#[cfg(windows)]
pub fn command(program: &str) -> std::process::Command {
    let mut command = std::process::Command::new(program);
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[cfg(test)]
mod tests {
    mod regression {
        use std::fs;
        use std::path::Path;

        // 契約: 窓の出ない起動に通さない直接の起動が許されるのは、画面を持つアプリ（explorer・mmc）か、
        // Linux だけで動く処理だけ。ここに足すときは、窓が出ないか確かめる。
        const ALLOWED: &[&str] = &[
            "launch.rs",
            "no_window.rs",
            "open.rs",
            "process_control.rs",
            "services.rs",
            "test_support.rs",
            "windows_list.rs",
        ];

        // なぜ: リソース モニターのネットワーク タブを開いている間、netstat が定期的に黒い窓を出していた
        #[test]
        fn console_programs_are_not_started_directly() {
            let mut offenders = Vec::new();
            let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
            let mut stack = vec![dir];
            while let Some(path) = stack.pop() {
                for entry in fs::read_dir(&path).unwrap().flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        stack.push(path);
                        continue;
                    }
                    let name = path.file_name().unwrap().to_string_lossy().into_owned();
                    let source = fs::read_to_string(&path).unwrap_or_default();
                    if path.extension().is_some_and(|e| e == "rs")
                        && !ALLOWED.contains(&name.as_str())
                        && source.contains("Command::new(")
                    {
                        offenders.push(name);
                    }
                }
            }
            assert_eq!(
                offenders,
                Vec::<String>::new(),
                "Command::new を直接使わず no_window::command を使う"
            );
        }
    }
}
