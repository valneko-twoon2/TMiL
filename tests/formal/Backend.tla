------------------------------- MODULE Backend -------------------------------
(***************************************************************************)
(* TMiL のバックエンド（BackendMachine の Step）を、まわりの環境と組み合わせて *)
(* 検査する。環境として次を自由に動かす。                                  *)
(*   - 利用者: ウィンドウの表示・非表示、終了、置き換えの依頼、プロセス終了 *)
(*   - 画面: 一定間隔の計測の依頼（間隔の長さは fresh で抽象化）           *)
(*   - OS: プロセスの終了と起動（PID の再利用を含む）                       *)
(*   - UAC: 承認または取り消し                                              *)
(*   - 他のツール: 置き換えの設定をいつでも書き換える                      *)
(***************************************************************************)
EXTENDS BackendMachine, Naturals

CONSTANTS
  Pids,            \* PID の集合
  Protected,       \* TMiL 自身とその子孫（WebView など）
  MaxIncarnation   \* PID を使い回す回数の上限（起動のたびに番号が増える）

ASSUME Protected \subseteq Pids /\ MaxIncarnation \in Nat

VARIABLES
  m,          \* 状態機械の状態
  registry,   \* 実際の置き換えの設定（"none", "tmil", "other"）
  elev,       \* 管理者としての書き込み: "idle", "running", "done"
  fresh,      \* 前回の計測から最小間隔がたっていないか
  procs,      \* PID ごとに今動いているプロセスの番号（0 = 無い）
  nextInc,    \* 次に起動するプロセスの番号
  shown,      \* 画面の一覧に出ているプロセスの番号（0 = 出ていない）
  violation   \* 破った約束の名前（"none" = 破っていない）

vars == <<m, registry, elev, fresh, procs, nextInc, shown, violation>>

ActualRegistries == {"none", "tmil", "other"}

Violations ==
  {"none", "sampledWhileHiddenOrQuitting", "overlappingSamples", "resampledTooSoon",
   "falseReplacementSuccess", "overlappingElevation", "actedWhileQuitting",
   "killedProtected", "killedReplacedProcess", "killedMissingProcess"}

TypeOK ==
  /\ m \in StateSpace
  /\ registry \in ActualRegistries
  /\ elev \in {"idle", "running", "done"}
  /\ fresh \in BOOLEAN
  /\ procs \in [Pids -> 0..MaxIncarnation]
  /\ nextInc \in 2..(MaxIncarnation + 1)
  /\ shown \in [Pids -> 0..MaxIncarnation]
  /\ violation \in Violations

Init ==
  /\ m = InitialState
  /\ registry \in ActualRegistries
  /\ elev = "idle"
  /\ fresh = FALSE
  /\ procs = [p \in Pids |-> 1]
  /\ nextInc = 2
  /\ shown = [p \in Pids |-> 0]
  /\ violation = "none"

(***************************************************************************)
(* 守るべき約束。遷移 r が約束を破っていれば、その名前を返す。             *)
(* これまでに直した不具合（グラフが跳ねる、UAC の取り消しが成功扱い、など）*)
(* がそれぞれの約束に当たる。                                              *)
(***************************************************************************)
Broken(r) ==
  IF r.effect = "sample" /\ (m.window # "visible" \/ m.life # "running")
    THEN "sampledWhileHiddenOrQuitting"
  ELSE IF r.effect = "sample" /\ m.sampling THEN "overlappingSamples"
  ELSE IF r.effect = "sample" /\ m.cached /\ fresh THEN "resampledTooSoon"
  ELSE IF r.effect = "replacementOk" /\ registry # Target(m.pending)
    THEN "falseReplacementSuccess"
  ELSE IF r.effect \in {"startEnable", "startDisable"} /\ (elev # "idle" \/ m.pending # "idle")
    THEN "overlappingElevation"
  ELSE IF m.life = "quitting" /\ r.effect \in {"sample", "kill", "startEnable", "startDisable"}
    THEN "actedWhileQuitting"
  ELSE "none"

\* 状態機械が出来事を受け付けた
Accept(r) ==
  /\ r.ok
  /\ m' = r.state
  /\ violation' = IF violation = "none" THEN Broken(r) ELSE violation

ShowWindow ==
  LET r == Step(m, [kind |-> "windowShown"]) IN
  Accept(r) /\ UNCHANGED <<registry, elev, fresh, procs, nextInc, shown>>

HideWindow ==
  LET r == Step(m, [kind |-> "windowHidden"]) IN
  Accept(r) /\ UNCHANGED <<registry, elev, fresh, procs, nextInc, shown>>

Quit ==
  LET r == Step(m, [kind |-> "quitRequested"]) IN
  Accept(r) /\ UNCHANGED <<registry, elev, fresh, procs, nextInc, shown>>

\* 画面が計測を頼む。古いかどうかは殻が時刻から判断して伝える
Poll ==
  LET r == Step(m, [kind |-> "snapshotRequested", stale |-> ~fresh]) IN
  Accept(r) /\ UNCHANGED <<registry, elev, fresh, procs, nextInc, shown>>

\* 計測が終わる。画面には今のプロセスが出る
FinishSample ==
  LET r == Step(m, [kind |-> "sampleFinished"]) IN
  /\ Accept(r)
  /\ fresh' = TRUE
  /\ shown' = procs
  /\ UNCHANGED <<registry, elev, procs, nextInc>>

TimePasses ==
  /\ fresh
  /\ fresh' = FALSE
  /\ UNCHANGED <<m, registry, elev, procs, nextInc, shown, violation>>

ObserveReplacement ==
  LET r == Step(m, [kind |-> "replacementObserved", registry |-> registry]) IN
  Accept(r) /\ UNCHANGED <<registry, elev, fresh, procs, nextInc, shown>>

RequestReplacement(enable) ==
  LET r == Step(m, [kind |-> "replacementRequested", enable |-> enable]) IN
  /\ Accept(r)
  /\ elev' = IF r.effect \in {"startEnable", "startDisable"} THEN "running" ELSE elev
  /\ UNCHANGED <<registry, fresh, procs, nextInc, shown>>

UacApproves ==
  /\ elev = "running"
  /\ registry' = Target(m.pending)
  /\ elev' = "done"
  /\ UNCHANGED <<m, fresh, procs, nextInc, shown, violation>>

UacCancels ==
  /\ elev = "running"
  /\ elev' = "done"
  /\ UNCHANGED <<m, registry, fresh, procs, nextInc, shown, violation>>

\* 書き込みが終わり、殻が改めて状態を確かめて伝える
ElevationReturns ==
  LET r == Step(m, [kind |-> "elevationFinished", registry |-> registry]) IN
  /\ elev = "done"
  /\ Accept(r)
  /\ elev' = "idle"
  /\ UNCHANGED <<registry, fresh, procs, nextInc, shown>>

\* 他のツール（Process Explorer など）が置き換えの設定を書き換える
OtherToolWrites ==
  /\ registry' \in {"none", "other"} \ {registry}
  /\ UNCHANGED <<m, elev, fresh, procs, nextInc, shown, violation>>

\* 利用者が、画面の一覧に出ているプロセスの終了を頼む
RequestKill(p) ==
  LET e == [kind |-> "killRequested", exists |-> procs[p] # 0,
            protected |-> p \in Protected, sameStart |-> procs[p] = shown[p]]
      r == Step(m, e)
  IN
  /\ shown[p] # 0
  /\ r.ok
  /\ m' = r.state
  /\ IF r.effect = "kill"
       THEN /\ procs' = [procs EXCEPT ![p] = 0]
            /\ violation' =
                 IF violation # "none" THEN violation
                 ELSE IF p \in Protected THEN "killedProtected"
                 ELSE IF procs[p] = 0 THEN "killedMissingProcess"
                 ELSE IF procs[p] # shown[p] THEN "killedReplacedProcess"
                 ELSE Broken(r)
       ELSE /\ procs' = procs
            /\ violation' = IF violation = "none" THEN Broken(r) ELSE violation
  /\ UNCHANGED <<registry, elev, fresh, nextInc, shown>>

\* OS がプロセスを終了させる（TMiL 自身とその子孫は動き続ける）
ProcessExits(p) ==
  /\ p \notin Protected
  /\ procs[p] # 0
  /\ procs' = [procs EXCEPT ![p] = 0]
  /\ UNCHANGED <<m, registry, elev, fresh, nextInc, shown, violation>>

\* OS が同じ PID で別のプロセスを起動する
ProcessStarts(p) ==
  /\ p \notin Protected
  /\ procs[p] = 0
  /\ nextInc <= MaxIncarnation
  /\ procs' = [procs EXCEPT ![p] = nextInc]
  /\ nextInc' = nextInc + 1
  /\ UNCHANGED <<m, registry, elev, fresh, shown, violation>>

Next ==
  \/ ShowWindow \/ HideWindow \/ Quit
  \/ Poll \/ FinishSample \/ TimePasses
  \/ ObserveReplacement \/ \E b \in BOOLEAN : RequestReplacement(b)
  \/ UacApproves \/ UacCancels \/ ElevationReturns \/ OtherToolWrites
  \/ \E p \in Pids : RequestKill(p) \/ ProcessExits(p) \/ ProcessStarts(p)

\* 計測と UAC の確認は、いつかは必ず終わる
Spec ==
  /\ Init
  /\ [][Next]_vars
  /\ WF_vars(FinishSample)
  /\ WF_vars(UacApproves \/ UacCancels)
  /\ WF_vars(ElevationReturns)

(***************************************************************************)
(* 検査する性質                                                            *)
(***************************************************************************)

\* 約束を 1 つも破らない
Safe == violation = "none"

\* 書き込みが動いているのは、状態機械が切り替え中のときだけ
ElevationConsistent == (elev = "idle") <=> (m.pending = "idle")

\* 計測は必ず終わる（「計測中」のまま止まらない）
SamplingCompletes == m.sampling ~> ~m.sampling

\* 置き換えの切り替えは必ず終わる
ElevationCompletes == (m.pending # "idle") ~> (m.pending = "idle")
=============================================================================
