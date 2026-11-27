//! フロントエンドへ渡すデータの型。JSON のキーは camelCase にそろえる。
//! 形を変えたら `tests/contract/fixtures` の契約も更新すること。

use serde::{Deserialize, Serialize};

/// 1 回の計測結果。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    /// 計測した時刻（UNIX エポックからのミリ秒）
    pub timestamp_ms: u64,
    pub cpu: CpuStats,
    pub memory: MemoryStats,
    pub disks: Vec<DiskStats>,
    pub networks: Vec<NetworkStats>,
    pub gpus: Vec<GpuStats>,
    pub processes: Vec<ProcessInfo>,
}

/// CPU 全体の状態。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CpuStats {
    /// 全体の使用率（0〜100）
    pub usage: f32,
    /// 論理コアごとの使用率（0〜100）
    pub per_core: Vec<f32>,
    /// 現在のクロック（MHz）
    pub frequency_mhz: u64,
    pub process_count: usize,
    pub uptime_secs: u64,
}

/// メモリの状態（バイト）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryStats {
    pub total: u64,
    pub used: u64,
    pub available: u64,
    /// どこにも使われていない量（Windows では取れないので `available` と同じ）
    pub free: u64,
    pub swap_total: u64,
    pub swap_used: u64,
}

/// ディスクの種類。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DiskKind {
    Ssd,
    Hdd,
    Unknown,
}

/// ディスク 1 台分の状態。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskStats {
    pub name: String,
    pub mount_point: String,
    pub file_system: String,
    pub kind: DiskKind,
    pub removable: bool,
    pub total: u64,
    pub available: u64,
    pub read_per_sec: u64,
    pub written_per_sec: u64,
}

/// ネットワークインターフェース 1 つ分の状態。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkStats {
    pub name: String,
    pub received_per_sec: u64,
    pub transmitted_per_sec: u64,
    pub total_received: u64,
    pub total_transmitted: u64,
    /// MAC アドレス（`00:00:00:00:00:00` の形。取れなければ空）
    pub mac_address: String,
    /// IP アドレスと接頭辞の長さ（例: `192.168.1.2/24`）
    pub addresses: Vec<String>,
}

/// GPU 1 つ分の状態。取れない値は `None`。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuStats {
    pub name: String,
    pub vendor: String,
    /// 使用率（0〜100）
    pub usage: Option<f32>,
    /// 専用メモリの合計と使用量（バイト）
    pub memory_total: Option<u64>,
    pub memory_used: Option<u64>,
}

/// プロセスの状態。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProcessState {
    Running,
    Sleeping,
    Stopped,
    Zombie,
    Other,
}

/// プロセス 1 つ分の情報。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub pid: u32,
    pub parent_pid: Option<u32>,
    pub name: String,
    /// 実行ファイルのパス（取れない場合は空）
    pub exe: String,
    /// コマンドライン（長すぎる場合は切り詰める）
    pub command: String,
    pub state: ProcessState,
    /// 実行ユーザー名（取れない場合は空）
    pub user: String,
    /// CPU 使用率（全コア合計を 100 とした値）
    pub cpu: f32,
    /// 物理メモリ使用量（バイト）
    pub memory: u64,
    pub disk_read_per_sec: u64,
    pub disk_written_per_sec: u64,
    /// 起動してからの秒数
    pub run_time_secs: u64,
    /// 起動した時刻（UNIX 秒）。終了するときに同じプロセスかを確かめるのに使う
    pub start_time: u64,
    /// 仮想メモリ（Windows ではコミット サイズ）
    pub virtual_memory: u64,
    /// 起動してから使った CPU 時間の合計（ミリ秒。コアごとの時間を足したもの）
    pub cpu_time_ms: u64,
    /// 起動してから読み書きしたバイト数の合計（Windows ではディスク以外の I/O も含む）
    pub disk_read_total: u64,
    pub disk_written_total: u64,
    /// ハンドルの数（Linux では開いているファイルの数）
    pub handles: Option<u32>,
    /// スレッドの数（Linux のみ）
    pub threads: Option<u32>,
    /// セッション ID（Linux ではセッションの先頭のプロセスの PID）
    pub session_id: Option<u32>,
    /// GPU 使用率（0〜100）と GPU メモリ（バイト）
    pub gpu: Option<f32>,
    pub gpu_memory: Option<u64>,
}

/// 終了するプロセスの指定。PID が別のプロセスに再利用されていないかを起動時刻で確かめる。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KillTarget {
    pub pid: u32,
    pub start_time: u64,
}

/// プロセスの優先度（Windows の優先度クラスに合わせた 6 段階）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Priority {
    Realtime,
    High,
    AboveNormal,
    Normal,
    BelowNormal,
    Low,
}

impl Priority {
    pub const ALL: [Self; 6] = [
        Self::Realtime,
        Self::High,
        Self::AboveNormal,
        Self::Normal,
        Self::BelowNormal,
        Self::Low,
    ];
}

/// プロセスの今の優先度と、動かしてよい CPU（取れなければ `None`）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessControls {
    pub priority: Option<Priority>,
    /// 動かしてよい論理プロセッサの番号（0 から）
    pub affinity: Option<Vec<u32>>,
}

/// 変化しないシステム情報。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub os_name: String,
    pub os_version: String,
    pub kernel_version: String,
    pub host_name: String,
    pub cpu_brand: String,
    pub physical_cores: Option<usize>,
    pub logical_cores: usize,
}

/// プロセス終了の結果。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KillResult {
    pub pid: u32,
    pub ok: bool,
    pub error: Option<String>,
}

/// スタートアップ項目の登録場所。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum StartupLocation {
    /// HKCU の Run キー
    RegistryUser,
    /// HKLM の Run キー
    RegistryMachine,
    /// ユーザーのスタートアップフォルダー
    FolderUser,
    /// 全ユーザー共通のスタートアップフォルダー
    FolderCommon,
    /// `~/.config/autostart`
    AutostartUser,
    /// `/etc/xdg/autostart` など
    AutostartSystem,
}

impl StartupLocation {
    /// ID の接頭辞として使う文字列。
    pub fn key(self) -> &'static str {
        match self {
            Self::RegistryUser => "registryUser",
            Self::RegistryMachine => "registryMachine",
            Self::FolderUser => "folderUser",
            Self::FolderCommon => "folderCommon",
            Self::AutostartUser => "autostartUser",
            Self::AutostartSystem => "autostartSystem",
        }
    }

    /// `key` の逆変換。
    pub fn from_key(key: &str) -> Option<Self> {
        [
            Self::RegistryUser,
            Self::RegistryMachine,
            Self::FolderUser,
            Self::FolderCommon,
            Self::AutostartUser,
            Self::AutostartSystem,
        ]
        .into_iter()
        .find(|l| l.key() == key)
    }
}

/// スタートアップ項目。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupEntry {
    /// `場所:名前` 形式の ID
    pub id: String,
    pub name: String,
    /// 起動されるコマンド全体
    pub command: String,
    /// コマンドのうち実行ファイル部分
    pub program: String,
    pub location: StartupLocation,
    pub enabled: bool,
    /// この画面から有効・無効を切り替えられるか
    pub can_toggle: bool,
}

/// タスクマネージャー置き換えの状態。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplacementStatus {
    /// この OS で使えるか（Windows のみ）
    pub supported: bool,
    /// TaskManagerLite に置き換わっているか
    pub replaced: bool,
    /// 別のアプリに置き換わっている場合、その設定値
    pub other: Option<String>,
}

/// 実行ファイルのアイコンと説明。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessIcon {
    /// 実行ファイルの場所（問い合わせに使った値そのまま）
    pub exe: String,
    /// 画像の data URL。見つからなければ `None`
    pub icon: Option<String>,
    /// 説明（Windows はファイルの説明、Linux は `.desktop` の名前）
    pub description: Option<String>,
    /// 発行元（Windows の会社名。Linux では取れない）
    pub company: Option<String>,
}

/// 画面にウィンドウを出しているプロセス（本家の「アプリ」）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppWindow {
    pub pid: u32,
    /// ウィンドウのタイトル（取れなければ空）
    pub title: String,
}

/// サービスの状態。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ServiceStatus {
    Running,
    Stopped,
    Paused,
    StartPending,
    StopPending,
    Other,
}

/// サービスの開始の種類。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ServiceStartType {
    Automatic,
    Manual,
    Disabled,
    Other,
}

/// サービス 1 つ分。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceInfo {
    /// サービス名（操作に使う）
    pub name: String,
    /// 表示名（本家の「説明」の列）
    pub display_name: String,
    /// 詳しい説明
    pub description: String,
    pub status: ServiceStatus,
    /// 動いているときのプロセス
    pub pid: Option<u32>,
    pub start_type: ServiceStartType,
    /// svchost のグループ（Windows のみ）
    pub group: String,
}

/// サービスへの操作。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ServiceAction {
    Start,
    Stop,
    Restart,
}

/// 通信の種類。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Protocol {
    Tcp,
    Udp,
}

/// TCP の接続の状態。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TcpState {
    Listen,
    Established,
    SynSent,
    SynReceived,
    FinWait1,
    FinWait2,
    TimeWait,
    CloseWait,
    LastAck,
    Closing,
    Closed,
}

/// ネットワークの接続か待ち受け 1 つ分。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub protocol: Protocol,
    pub local_address: String,
    pub local_port: u16,
    /// 相手（待ち受けや UDP では `0.0.0.0`・`::`・`*` など）
    pub remote_address: String,
    pub remote_port: u16,
    /// TCP の状態（UDP は `None`）
    pub state: Option<TcpState>,
    /// 持ち主のプロセス（分からなければ `None`）
    pub pid: Option<u32>,
}

/// プロセスが読み込んでいるモジュール 1 つ分。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleInfo {
    pub name: String,
    pub path: String,
    /// ファイルのバージョン（Windows のみ）
    pub version: Option<String>,
}

/// ファイルなどを開いているプロセス 1 つ分（リソース モニターの「関連付けられたハンドル」）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HandleInfo {
    pub pid: u32,
    /// 開いているものの場所（Linux ではソケットなども含む）
    pub path: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    mod equivalence {
        use super::*;

        #[test]
        fn startup_location_key_roundtrips_for_every_variant() {
            for loc in [
                StartupLocation::RegistryUser,
                StartupLocation::RegistryMachine,
                StartupLocation::FolderUser,
                StartupLocation::FolderCommon,
                StartupLocation::AutostartUser,
                StartupLocation::AutostartSystem,
            ] {
                assert_eq!(StartupLocation::from_key(loc.key()), Some(loc));
            }
        }

        #[test]
        fn unknown_location_key_is_none() {
            assert_eq!(StartupLocation::from_key("registry"), None);
        }
    }

    mod boundary {
        use super::*;

        #[test]
        fn empty_location_key_is_none() {
            assert_eq!(StartupLocation::from_key(""), None);
        }

        #[test]
        fn location_key_is_case_sensitive() {
            assert_eq!(StartupLocation::from_key("RegistryUser"), None);
        }
    }
}
