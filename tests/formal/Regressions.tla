----------------------------- MODULE Regressions -----------------------------
(***************************************************************************)
(* これまでに直した不具合を、わざと Step に戻した版。                      *)
(* Backend.tla の約束がそれぞれを確実に見つけること（検査が空振りしていない *)
(* こと）を確かめる。regressions/*.cfg ごとに 1 つずつ TLC で回し、        *)
(* 期待した約束違反が出れば合格とする（scripts/lib/formal.mjs）。          *)
(***************************************************************************)
EXTENDS Backend

Running(s) == s.life = "running"

\* 取得が重なると、計測を同時に 2 つ走らせていた（グラフが跳ねる）
OverlappingSamplesStep(s, e) ==
  IF e.kind = "snapshotRequested" /\ Running(s) /\ s.window = "visible" /\ s.sampling
    THEN To(s, "sample")
    ELSE Step(s, e)

\* 前回の計測から間もない取得でも計測し直していた（転送量や CPU 使用率が跳ねる）
ResampledTooSoonStep(s, e) ==
  IF e.kind = "snapshotRequested" /\ Running(s) /\ s.window = "visible"
     /\ ~s.sampling /\ s.cached /\ ~e.stale
    THEN To([s EXCEPT !.sampling = TRUE], "sample")
    ELSE Step(s, e)

\* ウィンドウが隠れている間も計測していた（トレイ常駐中に重くなる）
SampledWhileHiddenStep(s, e) ==
  IF e.kind = "snapshotRequested" /\ Running(s) /\ s.window = "hidden" /\ ~s.sampling
    THEN To([s EXCEPT !.sampling = TRUE], "sample")
    ELSE Step(s, e)

\* UAC を取り消しても成功扱いになっていた
FalseSuccessStep(s, e) ==
  IF e.kind = "elevationFinished" /\ s.pending # "idle" /\ e.registry # "unknown"
    THEN To([s EXCEPT !.registry = e.registry, !.pending = "idle"], "replacementOk")
    ELSE Step(s, e)

\* TMiL 自身の WebView まで終了できてしまい、画面が落ちていた
KillProtectedStep(s, e) ==
  IF e.kind = "killRequested" /\ Running(s) /\ e.exists /\ e.sameStart
    THEN To(s, "kill")
    ELSE Step(s, e)

\* 別のアプリの置き換えを確認なしで上書きし、「元に戻す」で消していた
OverwroteOtherToolStep(s, e) ==
  IF e.kind = "replacementRequested" /\ Running(s) /\ s.pending = "idle"
    THEN To([s EXCEPT !.pending = IF e.enable THEN "enable" ELSE "disable"],
            IF e.enable THEN "startEnable" ELSE "startDisable")
    ELSE Step(s, e)

\* 計測に失敗しても「直前の結果あり」になり、無い結果を返そうとしていた
CachedOnFailureStep(s, e) ==
  IF e.kind = "sampleFinished" /\ s.sampling
    THEN To([s EXCEPT !.sampling = FALSE, !.cached = TRUE], "nothing")
    ELSE Step(s, e)

\* PID が再利用された別のプロセスを終了しうる
KillReusedPidStep(s, e) ==
  IF e.kind = "killRequested" /\ Running(s) /\ e.exists /\ ~e.protected
    THEN To(s, "kill")
    ELSE Step(s, e)
=============================================================================
