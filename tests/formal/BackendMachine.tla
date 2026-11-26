--------------------------- MODULE BackendMachine ---------------------------
(***************************************************************************)
(* TMiL のバックエンドの状態機械。                                         *)
(* Rust の src/backend/core/src/machine/mod.rs の step と同じ判断をする。   *)
(* 一致していることは MachineConformance.tla（遷移表との突き合わせ）で確かめる。 *)
(***************************************************************************)
EXTENDS Naturals

Windows    == {"visible", "hidden"}
Lives      == {"running", "quitting"}
Registries == {"unknown", "none", "tmil", "other"}
Pendings   == {"idle", "enable", "disable"}

\* 状態: 表示・生死・計測中か・直前の結果を持つか・置き換えの状態・切り替え中か
StateSpace ==
  [window : Windows, life : Lives, sampling : BOOLEAN, cached : BOOLEAN,
   registry : Registries, pending : Pendings]

InitialState ==
  [window |-> "visible", life |-> "running", sampling |-> FALSE,
   cached |-> FALSE, registry |-> "unknown", pending |-> "idle"]

\* 出来事。プロセス終了は「存在するか・守るべきか・起動時刻が同じか」に抽象化する
EventSpace ==
       [kind : {"windowShown", "windowHidden", "quitRequested"}]
  \cup [kind : {"snapshotRequested"}, stale : BOOLEAN]
  \cup [kind : {"sampleFinished"}, ok : BOOLEAN]
  \cup [kind : {"replacementObserved", "elevationFinished"}, registry : Registries]
  \cup [kind : {"replacementRequested"}, enable : BOOLEAN]
  \cup [kind : {"killRequested"}, exists : BOOLEAN, protected : BOOLEAN,
        sameStart : BOOLEAN]

\* 呼び出し側が行うこと
EffectSpace ==
  {"nothing", "sample", "serveCached", "emitShown", "emitHidden", "exit",
   "startEnable", "startDisable", "replacementOk", "replacementFailed", "kill",
   "rejectHidden", "rejectBusy", "rejectQuitting", "rejectNotFound",
   "rejectProtected", "rejectReplaced", "rejectOtherTool"}

\* 遷移の結果。受け付けない出来事は ok = FALSE
NA == [ok |-> FALSE]
To(s, effect) == [ok |-> TRUE, state |-> s, effect |-> effect]

\* 切り替えが成功したときにあるべき置き換えの状態
Target(p) == IF p = "enable" THEN "tmil" ELSE "none"

\* 計測の依頼: 終了中 → 計測中 → 非表示 → まだ新しい の順に断り、残れば計測する
SnapshotStep(s, stale) ==
  IF s.life = "quitting" THEN To(s, "rejectQuitting")
  ELSE IF s.sampling THEN To(s, IF s.cached THEN "serveCached" ELSE "rejectBusy")
  ELSE IF s.window = "hidden" THEN To(s, IF s.cached THEN "serveCached" ELSE "rejectHidden")
  ELSE IF s.cached /\ ~stale THEN To(s, "serveCached")
  ELSE To([s EXCEPT !.sampling = TRUE], "sample")

\* 置き換えの依頼: 終了中・切り替え中・別のアプリが置き換えているときは断る
ReplacementRequestStep(s, enable) ==
  IF s.life = "quitting" THEN To(s, "rejectQuitting")
  ELSE IF s.pending # "idle" THEN To(s, "rejectBusy")
  ELSE IF s.registry = "other" THEN To(s, "rejectOtherTool")
  ELSE To([s EXCEPT !.pending = IF enable THEN "enable" ELSE "disable"],
          IF enable THEN "startEnable" ELSE "startDisable")

\* 切り替えの完了: 確かめた状態が頼んだ状態と同じときだけ成功とする
ElevationStep(s, registry) ==
  IF s.pending # "idle" /\ registry # "unknown"
    THEN To([s EXCEPT !.registry = registry, !.pending = "idle"],
            IF registry = Target(s.pending) THEN "replacementOk" ELSE "replacementFailed")
    ELSE NA

\* プロセスへの操作の依頼: 存在しない・守るべき・入れ替わった ものは断る
\* Rust では終了・優先度・関係の 3 種類があるが、判断は種類によらないので終了で代表させる
\* （種類によらないことは Rust の machine::tests::formal が全状態で確かめる）
KillStep(s, e) ==
  IF s.life = "quitting" THEN To(s, "rejectQuitting")
  ELSE IF ~e.exists THEN To(s, "rejectNotFound")
  ELSE IF e.protected THEN To(s, "rejectProtected")
  ELSE IF ~e.sameStart THEN To(s, "rejectReplaced")
  ELSE To(s, "kill")

Step(s, e) ==
  CASE e.kind = "windowShown" ->
         IF s.window = "hidden"
           THEN To([s EXCEPT !.window = "visible"], "emitShown") ELSE NA
    [] e.kind = "windowHidden" ->
         IF s.window = "visible"
           THEN To([s EXCEPT !.window = "hidden"], "emitHidden") ELSE NA
    [] e.kind = "quitRequested" ->
         IF s.life = "running"
           THEN To([s EXCEPT !.life = "quitting"], "exit") ELSE NA
    [] e.kind = "snapshotRequested" -> SnapshotStep(s, e.stale)
    [] e.kind = "sampleFinished" ->
         IF s.sampling
           THEN To([s EXCEPT !.sampling = FALSE, !.cached = s.cached \/ e.ok], "nothing") ELSE NA
    [] e.kind = "replacementObserved" ->
         IF s.pending = "idle" /\ e.registry # "unknown"
           THEN To([s EXCEPT !.registry = e.registry], "nothing") ELSE NA
    [] e.kind = "replacementRequested" -> ReplacementRequestStep(s, e.enable)
    [] e.kind = "elevationFinished" -> ElevationStep(s, e.registry)
    [] e.kind = "killRequested" -> KillStep(s, e)
=============================================================================
