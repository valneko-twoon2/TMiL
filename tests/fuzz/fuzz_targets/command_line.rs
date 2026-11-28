//! コマンドラインから実行ファイルを取り出す処理: 落ちず、結果が元の文字列の一部であること。
#![no_main]

use libfuzzer_sys::fuzz_target;
use taskmanagerlite_core::startup::command::program_of;

fuzz_target!(|command: &str| {
    let program = program_of(command);
    assert!(command.contains(program));
});
