//! `.desktop` の読み書き: どんな入力でも落ちず、書き換えた結果が指定どおりの状態になること。
#![no_main]

use libfuzzer_sys::fuzz_target;
use tmil_core::startup::desktop::{parse, with_enabled};

fuzz_target!(|data: (&str, bool)| {
    let (content, enabled) = data;
    let _ = parse(content);
    let rewritten = with_enabled(content, enabled);
    assert_eq!(parse(&rewritten).is_enabled(), enabled, "{content:?}");
});
