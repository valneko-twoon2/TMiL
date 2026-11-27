use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::ExeDetails;
use crate::base64;

const MAX_IMAGE_BYTES: u64 = 512 * 1024;
const SIZES: [&str; 7] = [
    "32x32", "48x48", "24x24", "64x64", "128x128", "256x256", "scalable",
];
const EXTENSIONS: [&str; 2] = ["png", "svg"];

#[derive(Debug, Clone, Default)]
pub struct SearchDirs {
    /// `.desktop` を探すフォルダー（前にあるものを優先）
    pub applications: Vec<PathBuf>,
    /// アイコンテーマのフォルダー（`<dir>/hicolor/32x32/apps/<name>.png` など）
    pub icons: Vec<PathBuf>,
    /// テーマ以外の画像のフォルダー（`<dir>/<name>.png`）
    pub pixmaps: Vec<PathBuf>,
}

impl SearchDirs {
    pub fn from_env(data_home: Option<&str>, data_dirs: Option<&str>, home: Option<&str>) -> Self {
        let mut bases: Vec<PathBuf> = Vec::new();
        match (data_home.filter(|s| !s.is_empty()), home) {
            (Some(dir), _) => bases.push(PathBuf::from(dir)),
            (None, Some(home)) => bases.push(Path::new(home).join(".local/share")),
            (None, None) => {}
        }
        let system = data_dirs
            .filter(|s| !s.is_empty())
            .unwrap_or("/usr/local/share:/usr/share");
        bases.extend(
            system
                .split(':')
                .filter(|s| !s.is_empty())
                .map(PathBuf::from),
        );
        bases.push(PathBuf::from("/var/lib/flatpak/exports/share"));
        Self {
            applications: bases.iter().map(|b| b.join("applications")).collect(),
            icons: bases.iter().map(|b| b.join("icons")).collect(),
            pixmaps: vec![PathBuf::from("/usr/share/pixmaps")],
        }
    }
}

fn desktop_keys(content: &str) -> HashMap<&str, &str> {
    let mut keys = HashMap::new();
    let mut in_main = false;
    for line in content.lines().map(str::trim) {
        if line.starts_with('[') {
            in_main = line == "[Desktop Entry]";
            continue;
        }
        if !in_main || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            keys.entry(key.trim()).or_insert(value.trim());
        }
    }
    keys
}

fn base_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

fn split_exec(exec: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    for c in exec.chars() {
        match (quote, c) {
            (Some(q), _) if c == q => quote = None,
            (None, '"' | '\'') => quote = Some(c),
            (None, _) if c.is_whitespace() => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(c),
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

/// `flatpak` などの起動役は、どのアプリか分からないので `None`。
pub fn exec_program(exec: &str) -> Option<String> {
    let tokens = split_exec(exec);
    let program = tokens.iter().find(|t| *t != "env" && !t.contains('='))?;
    let name = base_name(program);
    if name.is_empty() || matches!(name, "flatpak" | "snap" | "sh" | "bash") {
        return None;
    }
    Some(name.to_owned())
}

/// プログラム名 → アイコン名 の対応を作る（前のフォルダーを優先）。
pub fn build_index(applications: &[PathBuf]) -> HashMap<String, String> {
    index_by(applications, |keys| {
        keys.get("Icon")
            .filter(|i| !i.is_empty())
            .map(|i| (*i).to_owned())
    })
}

/// 言語の指定（`ja_JP.UTF-8` など）から、`Name` の後ろに付く言語の候補を、合う順に並べる。
pub fn locale_candidates(lang: &str) -> Vec<String> {
    let base = lang.split(['.', '@']).next().unwrap_or_default();
    let short = base.split('_').next().unwrap_or_default();
    let mut list = Vec::new();
    for candidate in [base, short] {
        if !candidate.is_empty() && !list.iter().any(|c| c == candidate) {
            list.push(candidate.to_owned());
        }
    }
    list
}

/// プログラム名 → 表示名（`Name`。言語に合う `Name[ja]` などがあればそちら）の対応を作る。
pub fn build_name_index(applications: &[PathBuf], lang: &str) -> HashMap<String, String> {
    let locales = locale_candidates(lang);
    index_by(applications, |keys| {
        locales
            .iter()
            .find_map(|l| keys.get(format!("Name[{l}]").as_str()))
            .or_else(|| keys.get("Name"))
            .filter(|n| !n.is_empty())
            .map(|n| (*n).to_owned())
    })
}

/// 実行ファイルの場所ごとに表示名を探す（渡した順に同じ数を返す）。
pub fn names_in(exes: &[String], dirs: &SearchDirs, lang: &str) -> Vec<Option<String>> {
    let index = build_name_index(&dirs.applications, lang);
    exes.iter()
        .map(|exe| {
            let program = base_name(exe);
            index
                .get(program)
                .or_else(|| index.get(&program.to_lowercase()))
                .cloned()
        })
        .collect()
}

fn index_by(
    applications: &[PathBuf],
    pick: impl Fn(&HashMap<&str, &str>) -> Option<String>,
) -> HashMap<String, String> {
    let mut index = HashMap::new();
    for dir in applications {
        let Ok(entries) = std::fs::read_dir(dir) else {
            continue;
        };
        let mut files: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|e| e == "desktop"))
            .collect();
        files.sort();
        for file in files {
            let Ok(content) = std::fs::read_to_string(&file) else {
                continue;
            };
            let keys = desktop_keys(&content);
            let Some(value) = pick(&keys) else {
                continue;
            };
            let programs = [
                keys.get("Exec").and_then(|e| exec_program(e)),
                keys.get("TryExec").map(|t| base_name(t).to_owned()),
                keys.get("StartupWMClass").map(|c| c.to_lowercase()),
            ];
            for program in programs.into_iter().flatten() {
                index.entry(program).or_insert_with(|| value.clone());
            }
        }
    }
    index
}

pub fn find_image(name: &str, dirs: &SearchDirs) -> Option<PathBuf> {
    if name.starts_with('/') {
        let path = PathBuf::from(name);
        return path.is_file().then_some(path);
    }
    if name.contains(['/', '\\']) || name.starts_with('.') {
        return None;
    }
    let themed = dirs.icons.iter().flat_map(|base| {
        SIZES.iter().flat_map(move |size| {
            EXTENSIONS.iter().map(move |ext| {
                base.join("hicolor")
                    .join(size)
                    .join("apps")
                    .join(format!("{name}.{ext}"))
            })
        })
    });
    let plain = dirs.pixmaps.iter().flat_map(|base| {
        EXTENSIONS
            .iter()
            .map(move |ext| base.join(format!("{name}.{ext}")))
    });
    themed.chain(plain).find(|p| p.is_file())
}

/// 画像ファイルを data URL にする。大きすぎるものや知らない形式は `None`。
pub fn data_url(path: &Path) -> Option<String> {
    let mime = match path.extension()?.to_str()? {
        "png" => "image/png",
        "svg" => "image/svg+xml",
        _ => return None,
    };
    if std::fs::metadata(path).ok()?.len() > MAX_IMAGE_BYTES {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    Some(format!("data:{mime};base64,{}", base64::encode(&bytes)))
}

/// 実行ファイルの場所ごとにアイコンを探す（渡した順に同じ数を返す）。
pub fn load_in(exes: &[String], dirs: &SearchDirs) -> Vec<Option<String>> {
    let index = build_index(&dirs.applications);
    exes.iter()
        .map(|exe| {
            let program = base_name(exe);
            let icon = index
                .get(program)
                .or_else(|| index.get(&program.to_lowercase()))
                .map_or(program, String::as_str);
            find_image(icon, dirs).and_then(|p| data_url(&p))
        })
        .collect()
}

/// アイコンと表示名をまとめて探す（渡した順に同じ数を返す。発行元は Linux では分からない）。
pub fn details_in(exes: &[String], dirs: &SearchDirs, lang: &str) -> Vec<ExeDetails> {
    load_in(exes, dirs)
        .into_iter()
        .zip(names_in(exes, dirs, lang))
        .map(|(icon, description)| ExeDetails {
            icon,
            description,
            company: None,
        })
        .collect()
}

pub fn load(exes: &[String]) -> Vec<ExeDetails> {
    let dirs = SearchDirs::from_env(
        std::env::var("XDG_DATA_HOME").ok().as_deref(),
        std::env::var("XDG_DATA_DIRS").ok().as_deref(),
        std::env::var("HOME").ok().as_deref(),
    );
    let lang = ["LC_ALL", "LC_MESSAGES", "LANG"]
        .into_iter()
        .find_map(|k| std::env::var(k).ok().filter(|v| !v.is_empty()))
        .unwrap_or_default();
    details_in(exes, &dirs, &lang)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::startup::test_support::TempDir;

    fn write(path: &Path, body: &[u8]) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }

    fn dirs(root: &Path) -> SearchDirs {
        SearchDirs {
            applications: vec![
                root.join("user/applications"),
                root.join("system/applications"),
            ],
            icons: vec![root.join("system/icons")],
            pixmaps: vec![root.join("pixmaps")],
        }
    }

    mod equivalence {
        use super::*;

        #[test]
        fn exe_is_matched_through_desktop_file() {
            let tmp = TempDir::new("icons-desktop");
            let root = tmp.path();
            write(
                &root.join("system/applications/firefox.desktop"),
                b"[Desktop Entry]\nExec=/usr/lib/firefox/firefox %u\nIcon=firefox\n",
            );
            write(
                &root.join("system/icons/hicolor/48x48/apps/firefox.png"),
                b"png",
            );
            let icons = load_in(&["/usr/lib/firefox/firefox".to_owned()], &dirs(root));
            assert_eq!(
                icons,
                vec![Some(format!(
                    "data:image/png;base64,{}",
                    base64::encode(b"png")
                ))]
            );
        }

        #[test]
        fn icon_named_like_program_is_used_without_desktop_file() {
            let tmp = TempDir::new("icons-plain");
            let root = tmp.path();
            write(&root.join("pixmaps/htop.svg"), b"<svg/>");
            let icons = load_in(&["/usr/bin/htop".to_owned()], &dirs(root));
            assert!(
                icons
                    .first()
                    .unwrap()
                    .as_deref()
                    .unwrap()
                    .starts_with("data:image/svg+xml;base64,")
            );
        }

        #[test]
        fn user_desktop_file_has_priority() {
            let tmp = TempDir::new("icons-priority");
            let root = tmp.path();
            write(
                &root.join("user/applications/a.desktop"),
                b"[Desktop Entry]\nExec=app\nIcon=mine\n",
            );
            write(
                &root.join("system/applications/a.desktop"),
                b"[Desktop Entry]\nExec=app\nIcon=theirs\n",
            );
            assert_eq!(
                build_index(&dirs(root).applications)
                    .get("app")
                    .map(String::as_str),
                Some("mine")
            );
        }

        #[test]
        fn exec_program_skips_env_and_quotes() {
            assert_eq!(
                exec_program("env FOO=1 \"/opt/My App/app\" --x"),
                Some("app".to_owned())
            );
            assert_eq!(
                exec_program("code --new-window %F"),
                Some("code".to_owned())
            );
        }

        #[test]
        fn try_exec_and_wm_class_are_also_keys() {
            let tmp = TempDir::new("icons-keys");
            let root = tmp.path();
            write(
                &root.join("system/applications/b.desktop"),
                b"[Desktop Entry]\nExec=flatpak run org.b\nTryExec=/usr/bin/bee\nStartupWMClass=Bee-App\nIcon=b\n",
            );
            let index = build_index(&dirs(root).applications);
            assert_eq!(index.get("bee").map(String::as_str), Some("b"));
            assert_eq!(index.get("bee-app").map(String::as_str), Some("b"));
            assert_eq!(index.get("flatpak"), None);
        }

        #[test]
        fn name_follows_language_and_falls_back_to_plain_name() {
            let tmp = TempDir::new("icons-names");
            let root = tmp.path();
            write(
                &root.join("system/applications/firefox.desktop"),
                "[Desktop Entry]
Exec=firefox %u
Name=Firefox Web Browser
Name[ja]=Firefox ウェブ・ブラウザ
Icon=firefox
"
                .as_bytes(),
            );
            let exes = ["/usr/lib/firefox/firefox".to_owned()];
            assert_eq!(
                names_in(&exes, &dirs(root), "ja_JP.UTF-8"),
                vec![Some("Firefox ウェブ・ブラウザ".to_owned())]
            );
            assert_eq!(
                names_in(&exes, &dirs(root), "fr_FR.UTF-8"),
                vec![Some("Firefox Web Browser".to_owned())]
            );
            let details = details_in(&exes, &dirs(root), "en_US");
            assert_eq!(details.first().unwrap().company, None);
        }

        #[test]
        fn locale_candidates_go_from_specific_to_general() {
            assert_eq!(
                locale_candidates("ja_JP.UTF-8"),
                vec!["ja_JP".to_owned(), "ja".to_owned()]
            );
            assert_eq!(
                locale_candidates("sr_RS@latin"),
                vec!["sr_RS".to_owned(), "sr".to_owned()]
            );
        }

        #[test]
        fn env_dirs_follow_xdg() {
            let d = SearchDirs::from_env(Some("/h/data"), Some("/a:/b"), Some("/home/u"));
            assert_eq!(
                d.applications.first(),
                Some(&PathBuf::from("/h/data/applications"))
            );
            assert!(d.icons.contains(&PathBuf::from("/b/icons")));
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn missing_everything_gives_none_for_each_exe() {
            let tmp = TempDir::new("icons-none");
            let icons = load_in(&["/x/a".to_owned(), String::new()], &dirs(tmp.path()));
            assert_eq!(icons, vec![None, None]);
        }

        #[test]
        fn too_large_or_unknown_images_are_skipped() {
            let tmp = TempDir::new("icons-large");
            let big = tmp.path().join("big.png");
            write(
                &big,
                &vec![0u8; usize::try_from(MAX_IMAGE_BYTES).unwrap() + 1],
            );
            assert_eq!(data_url(&big), None);
            let xpm = tmp.path().join("a.xpm");
            write(&xpm, b"x");
            assert_eq!(data_url(&xpm), None);
        }

        #[test]
        fn icon_names_with_separators_are_not_searched() {
            let tmp = TempDir::new("icons-escape");
            write(&tmp.path().join("pixmaps/../secret.png"), b"x");
            assert_eq!(find_image("../secret", &dirs(tmp.path())), None);
            // 「.」で始まらなくても、途中に区切りがあれば探す場所の外を指しうる
            write(&tmp.path().join("pixmaps/sub/secret.png"), b"x");
            assert_eq!(find_image("sub/secret", &dirs(tmp.path())), None);
            assert_eq!(find_image("sub\\secret", &dirs(tmp.path())), None);
            // 区切りが無くても「.」で始まる名前（隠しファイル）は使わない
            write(&tmp.path().join("pixmaps/.hidden.png"), b"x");
            assert_eq!(find_image(".hidden", &dirs(tmp.path())), None);
        }

        #[test]
        fn image_size_limit_is_512_kib_inclusive() {
            let tmp = TempDir::new("icons-limit");
            let limit = usize::try_from(MAX_IMAGE_BYTES).unwrap();
            let small = tmp.path().join("small.png");
            write(&small, &[0u8; 2000]);
            assert!(data_url(&small).is_some());
            let exact = tmp.path().join("exact.png");
            write(&exact, &vec![0u8; limit]);
            assert!(data_url(&exact).is_some());
        }

        #[test]
        fn icon_outside_main_group_is_ignored() {
            let tmp = TempDir::new("icons-group");
            let root = tmp.path();
            write(
                &root.join("system/applications/c.desktop"),
                b"[Desktop Entry]\nExec=cee\n[Desktop Action new]\nIcon=wrong\n",
            );
            assert_eq!(build_index(&dirs(root).applications).get("cee"), None);
        }

        #[test]
        fn load_returns_one_result_per_exe() {
            let exes = vec![String::new(), "/taskmanagerlite/no/such/app".to_owned()];
            assert_eq!(
                load(&exes),
                vec![ExeDetails::default(), ExeDetails::default()]
            );
        }

        #[test]
        fn locale_without_region_or_encoding() {
            assert_eq!(locale_candidates("ja"), vec!["ja".to_owned()]);
            assert_eq!(locale_candidates(""), Vec::<String>::new());
            assert_eq!(locale_candidates("C.UTF-8"), vec!["C".to_owned()]);
        }

        #[test]
        fn entry_without_name_has_no_description() {
            let tmp = TempDir::new("icons-noname");
            let root = tmp.path();
            write(
                &root.join("system/applications/d.desktop"),
                b"[Desktop Entry]
Exec=dee
Name=
Icon=d
",
            );
            assert_eq!(
                names_in(&["/usr/bin/dee".to_owned()], &dirs(root), "ja_JP"),
                vec![None]
            );
        }

        #[test]
        fn empty_env_falls_back_to_defaults() {
            let d = SearchDirs::from_env(Some(""), Some(""), Some("/home/u"));
            assert_eq!(
                d.applications.first(),
                Some(&PathBuf::from("/home/u/.local/share/applications"))
            );
            assert!(
                d.applications
                    .contains(&PathBuf::from("/usr/share/applications"))
            );
        }

        #[test]
        fn exec_without_program_is_none() {
            assert_eq!(exec_program(""), None);
            assert_eq!(exec_program("env A=1"), None);
        }
    }
}
