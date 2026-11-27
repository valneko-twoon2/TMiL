//! Windows 引数のクォート: CommandLineToArgvW の規則で読み戻すと元の文字列に戻ること。
#![no_main]

use libfuzzer_sys::fuzz_target;
use taskmanagerlite_core::taskmgr::{quote_windows_arg, unquote_windows_arg};

fuzz_target!(|arg: &str| {
    assert_eq!(
        unquote_windows_arg(&quote_windows_arg(arg)),
        Some(arg.to_owned())
    );
});
