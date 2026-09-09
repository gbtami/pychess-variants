Study review: PyChess 1.11.66 → 303bf70dc

Compared with local lila 39deb036f3. Scope: Study persistence, HTTP and websocket mutations, collaboration, REC/SYNC, permissions, annotations, PGN, Fishnet integration, and custom-variant lifetime. Unrelated merged PRs were considered only where they intersect these flows. No application source was changed. This review does not establish visual parity across themes, devices, or variant families.

The overall architecture follows lichess well: separate Study/chapter documents, on-demand chapter loading, explicit read/write roles, incremental validated tree operations, and independent REC/SYNC concepts. However, the implemented feature still has privacy, persistence, and synchronization defects that should be fixed before production rollout.

1. **[P1] Reauthorize websocket joins atomically with privacy/membership changes.**

   PyChess: [ws.py](/home/tami/pychess-variants/server/study/ws.py:654), [room initialization](/home/tami/pychess-variants/server/study/ws.py:506), [privacy update](/home/tami/pychess-variants/server/views/study.py:1202).

   The handshake authorizes a Study object loaded before several awaits, then passes that object into `init_ws`. If the owner makes the study private, or removes a reader from a private study, between authorization and room insertion, the revocation closes only sockets already in the room. The late socket joins with stale authorization. Broadcasts trust room membership and subsequently send private changes to it; Fishnet progress even contains the entire chapter tree.

   Reproduced at the room-initialization boundary: save the public Study snapshot, change its persisted visibility to private, then complete initialization with the earlier snapshot. The outsider is present in the private room. This is access to future private edits, beyond content already received while the study was public.

   Fix: share one sequencer for fresh authorization plus room insertion and visibility/member revocation. Closing an enumerated set of sockets alone does not close this race.

2. **[P1] Serialize chapter CRUD with the same Study lock as tree mutations.**

   PyChess: [delete_chapter](/home/tami/pychess-variants/server/study/storage.py:1429), [add_chapter_from_draft](/home/tami/pychess-variants/server/study/storage.py:989), [HTTP handlers](/home/tami/pychess-variants/server/views/study.py:1292).

   Chapter CRUD reads state and writes multiple documents without the websocket sequencer. Two requests deleting different chapters of a two-chapter study can both observe two chapters, both pass the minimum-count guard, and both succeed. Reproduced with an asyncio barrier at the delete boundary: two successful deletes, zero remaining chapters. The study then cannot be opened through its normal routes. Concurrent additions likewise race on the chapter cap and next order; deletion can overwrite a newer shared chapter selection with its stale Study object.

   Lichess puts add, edit, and delete through `sequenceStudy`: [StudyApi.scala](/home/tami/lila/modules/study/src/main/StudyApi.scala:614), [deleteChapter](/home/tami/lila/modules/study/src/main/StudyApi.scala:722).

   Fix: acquire the Study lock before loading authoritative permission/chapter state and hold it through mutation and broadcast. Reload the Study inside that lock. Merely wrapping the final write leaves the stale reads intact.

3. **[P1] Bound custom-snapshot registration before loading untrusted imports into the main engine.**

   PyChess: [snapshot cache](/home/tami/pychess-variants/server/study/variant.py:35), [import validation ordering](/home/tami/pychess-variants/server/study/builder.py:194), [native registration](/home/tami/pychess-variants/server/catalogued_variants.py:2765).

   Importing an embedded variant snapshot hashes the raw INI and registers the resulting alias in process-wide pyffish before FEN/tree validation. Both the native definition and `_SNAPSHOT_VALIDATION` survive failed imports. Changing only an INI comment creates a different hash. Reproduced three rejected imports with invalid FENs: three additional native variants and three additional cached snapshots, with no saved chapters required.

   The chapter cap and ordinary catalogue quota do not bound this path. Repeated distinct imports can keep increasing main-process memory. Evicting just the Python dictionary would not unload native definitions.

   Fix: validate untrusted snapshots in an isolated/recyclable process, and apply admission limits before registration in the serving process. Preserve immutable historical rules while giving native registrations an explicit lifetime/resource budget.

4. **[P1] Reconcile duplicate moves without abandoning queued continuation moves.**

   PyChess: [server deduplication](/home/tami/pychess-variants/server/study/mutations.py:147), [client acknowledgement](/home/tami/pychess-variants/client/study/studySync.ts:860).

   Two contributors can independently play the same move at the same parent and generate different random node IDs. The server correctly deduplicates by move and returns the first contributor's ID. The second client treats that authoritative ID as an error and reloads. If that client has already entered a reply or annotation, its remaining queued operations are never sent and are not restored after reload.

   Reproduced a local `e4, e5` sequence plus a concurrent remote `e4`: reload reason `node_canonicalized`, sent moves only `e2e4`, two operations still pending. A navigation warning can interrupt the reload, but it does not reconcile the queue or make the continuation saveable.

   Lichess's deterministic move IDs avoid this particular identity conflict. PyChess's documented choice of opaque variant-independent IDs is reasonable; it requires remapping the losing local node and all descendant paths/pending operations to the server's canonical ID.

5. **[P2] Broadcast chapter additions, edits, and deletions to the room.**

   PyChess: [create/edit handlers](/home/tami/pychess-variants/server/views/study.py:1307), [delete handler](/home/tami/pychess-variants/server/views/study.py:1355), [creation changes shared position](/home/tami/pychess-variants/server/study/storage.py:1018).

   These routes redirect only the requester. Add/import changes persisted `currentChapter` and clears `currentPath` without sending a shared-position or chapter-list event. Connected collaborators retain stale chapter lists, names/orientation, and potentially a deleted active chapter. A synchronized viewer does not follow a newly created chapter until some later action happens to publish a position. The same behavior occurs when adding analysis to an existing study.

   Lichess explicitly publishes chapter creation, changed previews, and active chapter changes: [doAddChapter](/home/tami/lila/modules/study/src/main/StudyApi.scala:647), [editChapter](/home/tami/lila/modules/study/src/main/StudyApi.scala:667), [deleteChapter](/home/tami/lila/modules/study/src/main/StudyApi.scala:722).

   Fix: emit chapter metadata/list and position changes as part of the serialized operation. Honor the creator's SYNC mode instead of unconditionally changing the shared chapter when creating/importing privately.

6. **[P2] Close the snapshot-to-stream gap during initial load and chapter switches.**

   PyChess: [connection acknowledgement](/home/tami/pychess-variants/server/study/ws.py:516), [initial connection processing](/home/tami/pychess-variants/client/study/studySync.ts:487), [other-chapter messages are discarded](/home/tami/pychess-variants/client/study/studySync.ts:737), [chapter fetch/apply](/home/tami/pychess-variants/client/study/chapterNavigation.ts:37).

   Initial HTTP data can become stale before the socket joins. The acknowledgement includes only the study ID, with no chapter revision comparison or catch-up. During chapter navigation, the existing extension discards events for the target chapter until the new extension is mounted; an edit after the target snapshot is read but before mounting is lost locally. The user can stay on a stale tree indefinitely if no later event arrives. The next mutation can instead trigger a revision-gap reload and interrupt pending edits.

   Lichess has versioned room messages and exposes socket version data: [StudySocket.scala](/home/tami/lila/modules/study/src/main/StudySocket.scala:275), [Study controller](/home/tami/lila/app/controllers/Study.scala:181).

   Fix: establish a snapshot/revision boundary and buffer/replay subsequent events, or verify the freshly mounted chapter against the subscribed stream before accepting local mutations. The initial connection needs this as well as reconnects.

7. **[P2] Preserve results, clocks, and evaluations in PGN export.**

   PyChess: [tag generation](/home/tami/pychess-variants/client/study/studyPgn.ts:119), [movetext generation](/home/tami/pychess-variants/client/study/studyPgn.ts:183).

   Export unconditionally sets `Result` to `*` and appends `*` to movetext, even for an imported game with a saved `1-0`, `0-1`, or draw result. It also ignores persisted node clocks and evaluations. Reproduced an export with `Result: 1-0`, a clock snapshot, and an evaluation: result became `*`, and neither a clock nor evaluation directive was emitted. This makes a download/reimport lose saved information.

   Lichess adds the default result only when the chapter lacks one and supports clock export: [PgnDump.scala](/home/tami/lila/modules/study/src/main/PgnDump.scala:111), [node export](/home/tami/lila/modules/study/src/main/PgnDump.scala:164).

   Fix: preserve a valid saved result consistently in headers and movetext and serialize supported clock/evaluation directives. Align the importer with those exported values. The current frontend test explicitly expects the destructive `*` result, so its green result does not verify lichess parity.

8. **[P2] Recompute feature capabilities when read membership changes.**

   PyChess: [member event handling](/home/tami/pychess-variants/client/study/studySync.ts:714), [view callback](/home/tami/pychess-variants/client/study/studyView.ts:1971).

   A member event reloads only if `canWrite` changes. For a public study with computer/clone/share restricted to members, adding or removing a read-only member leaves `canWrite == false` on both sides. The page therefore retains stale `features.computer`, `canClone`, and `canShare`. A removed reader can keep the already-running local engine enabled; a newly added reader cannot use newly granted features until reloading. Server clone/export authorization is checked independently, so the stale controls can also fail when clicked.

   Fix: send/evaluate the complete viewer capability set after membership changes, including transitions that never grant writing.

9. **[P2] Integrate Study data with account erasure before public rollout.**

   PyChess: [account cleanup](/home/tami/pychess-variants/server/account_api.py:284), [Study rollout requirements](/home/tami/pychess-variants/docs/Study-TODO.md:1436).

   The account deletion flow scrubs forum posts, blog posts, messages, tournaments, and Simuls, but does not touch Study/chapter documents, comment authorship, memberships, or likes. Public Study text and author identity remain available after the account is marked erased. This is an omitted application lifecycle integration, explicitly anticipated by the Study design document.

   Fix: define the collaborative-content policy, then implement it in account cleanup, updating discovery/profile data and live room access as necessary. Ownership transfer, anonymization, or deletion should be deliberate rather than an accidental consequence of leaving the collections untouched.

Documented parity scope

Practice, concealment, interactive lessons/gamebook, chat, chapter search, multiboard previews, GIF export, relay/broadcast, full API parity, and two-board chapters remain deferred. These are product-scope differences, not evidence that the implemented ordinary Study workflows are defective. Chapter reordering is also absent from the current Study UI/routes. Opaque node IDs and immutable custom-rule snapshots are sensible PyChess adaptations, subject to the reconciliation and resource issues above.

Evidence and limits

- Backend reproduction: [study_review_repro.py](/tmp/study_review_repro.py). It uses a mock database and a controlled scheduling barrier, and calls actual application functions. It demonstrated zero remaining chapters after concurrent deletion, stale authorization at room insertion, and native registrations retained by rejected imports. It did not query production.
- Frontend reproduction: [study_review_frontend.mjs](/tmp/study_review_frontend.mjs). It bundles the actual Study modules with rendering stubbed, demonstrating the duplicate-move queue failure and lossy PGN output.
- Before the instruction to stop rerunning workflows: targeted Python coverage passed 116 tests plus 27 subtests; selected frontend coverage passed 130 tests. The development bundle built successfully.
- The already-started Study browser suite completed with one pass and two failures. Both failing scenarios still assume the previous one-step creation flow; the new first-chapter modal prevents their expected navigation. The current Python GitHub workflow runs unittest discovery and the Simul pytest module, not these Study pytest browser scenarios. Its green state is consistent with these stale scenarios. No additional CI gates were run after the instruction.
- Findings 1–4 and 7 include isolated reproductions. Findings 5, 6, 8, and 9 are based on traced code paths. CSS/computed styles and live lichess runtime parity were not verified in this review.
