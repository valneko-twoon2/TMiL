------------------------- MODULE MachineConformance -------------------------
(***************************************************************************)
(* Rust の machine::step と TLA+ の Step が、全状態 x 全出来事で同じ判断を *)
(* することを確かめる。MachineTable.tla は Rust のテストが書き出した遷移表。 *)
(***************************************************************************)
EXTENDS BackendMachine, MachineTable, Naturals, Sequences, FiniteSets

Rng(seq) == {seq[i] : i \in DOMAIN seq}

\* Rust が列挙した状態・出来事・行うことが、TLA+ 側の定義とちょうど同じ
ASSUME Rng(TableStates) = StateSpace /\ Len(TableStates) = Cardinality(StateSpace)
ASSUME Rng(TableEvents) = EventSpace /\ Len(TableEvents) = Cardinality(EventSpace)
ASSUME Rng(TableEffects) = EffectSpace /\ Len(TableEffects) = Cardinality(EffectSpace)

\* 全ての組（状態, 出来事）がちょうど 1 行ずつある
ASSUME /\ {<<row[1], row[2]>> : row \in TableRows} = (DOMAIN TableStates) \X (DOMAIN TableEvents)
       /\ Cardinality(TableRows) = Len(TableStates) * Len(TableEvents)

\* 各行で、Rust の結果と TLA+ の Step の結果が同じ
ASSUME \A row \in TableRows :
         LET r == Step(TableStates[row[1]], TableEvents[row[2]]) IN
           IF row[3] = 0
             THEN ~r.ok
             ELSE /\ r.ok
                  /\ r.state = TableStates[row[3]]
                  /\ r.effect = TableEffects[row[4]]

\* TLC を動かすための形だけの仕様（確かめるのは上の ASSUME）
VARIABLE checked
Init == checked = TRUE
Next == UNCHANGED checked
=============================================================================
