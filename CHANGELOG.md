# Changelog

## 0.11.2-rc.1 — shareable release candidate

- Add MIT licensing, third-party notices, fixed-version Codex skill installation, examples, and contribution workflow.
- Include reviewed guidance for naming and reusing architecture views.
- Update markdown-it to 14.3.2 to address published denial-of-service advisories; verify rendered output with the full suite.
- Preserve the existing CLI, model schema, and semantic review requirements.

## 0.11.1 — grouped source evidence

- Show one complete paragraph per occurrence when several exact evidence ranges point into the same paragraph. Merge overlapping and adjacent highlights, preserve separate ranges, and retain safe native tables.

## 0.11.0 — section controls and relation identity

- Add a keyboard accessible original-section selector and batch block expand/collapse in the nested reader. Preserve other sections, ancestors, selection, evidence and URL state.
- Count v5 relations from published origin and basis in the legend, with source roll-ups separate and a clear zero-inference message. Show source-inferred rationale and source roll-up supporting references in relation details.
- Keep published relation labels, source solid lines, interpretation dashed lines and the existing schema unchanged.

## 0.9.5 — concise references and mobile types

- Show a resolved source value once when its source label repeats it, while retaining the source link. Distinct labels and values remain visible. Format the published amount/unit/basis/scope quantity shape without dropping basis or scope.
- Add mobile-only type badges and accessible type names to v5 source element and block tree entries. Desktop tree text remains compact.
- Hide a source roll-up route when every declared supporting atomic endpoint pair is directly visible. Partial expansion keeps the roll-up available; native source and independent inference relations remain.

## 0.9.4 — narrow-screen relation hit targets

- Keep the source tree in normal document flow on screens up to 700 px wide. The full expanded tree remains available without a height cap and no longer covers relation buttons farther down the page.

## 0.9.3 — relation detail on demand

- Open a folded multi-relation entrance as a concise list of the actual relations, types, endpoints and source or inference identity. Select one relation to inspect its full details.
- Show relation endpoints and exact member sets as short, clickable object labels. The full published object text and evidence remain reachable on demand, including long source tables. Long resolved source fields are collapsed with their complete values retained; the `possible` value reads “可选”.

## 0.9.2 — compact folded relation entrances

- Show one accessible “内含N条关系” entrance per folded container, with every real relation available in its detail list. Source-only mode recounts only source relations, including when restoring a mixed selection.
- Put the actual relation type and, where needed, relation count on cross-container lines. Mark a high-level relation “部分成员” when its declared endpoint sets cover only part of a container; exact counts, members, form and qualifiers remain in details.
- Preserve v2–v4 captions and the existing graph/list, keyboard, narrow-screen, evidence and SVG behavior.

## 0.9.1 — folded roll-up display

- When a visible source roll-up explicitly lists an atomic source edge, omit only that atomic edge's folded route at the same displayed endpoints. Opening the roll-up still lists each true endpoint pair and offers its atomic edge for inspection, including constituent qualifiers; expanding the members restores their real routes.
- Keep source-native and project-inference routes independent. An atomic route remains visible without a matching declared roll-up route, and older model versions keep their previous display.

## 0.9.0 — typed blocks and precise relations

- Accept `diagram-domain-model/v5` with `source-reading-map/v2`; preserve previous model and map readers.
- Validate the six registered content types, block focus references, the eight source element kinds, qualifier bindings, exact member sets and the four graph relation forms. Source-native and project-inference container relations may stand without a lower element edge. Source roll-ups retain constituent endpoint pairs and qualifier identities.
- Group folded links by relation type, direction, origin, form and qualifiers. Show actual element kinds, block content types, exact member endpoints and resolved source references in the nested view. Keep inference dashed and source-only filtering tied to origin.
- Add an original fictional library fixture with all relation branches, partial members and regression checks.

## 0.8.3

- Highlight an ordinary pipe-delimited source line as text; show the table range note only when the safe paragraph template actually contains a rendered table.
- Label minimal occurrence details “要素” while keeping published element text and original evidence separately identified.

## 0.8.2

- Keep v2 leaf sections folded on the initial nested view while opening necessary nested-section ancestors; direct chapter elements remain visible. Manual expansion still shows all members.
- Show the published element body once in occurrence details, followed by separately labelled highlighted original evidence.

## 0.8.1

- Only inferred relations display inference rationale in minimal details; a source relation with a recorded rationale retains its source identity.

## 0.8.0 — minimal nested source reading

- Accept domain v4 and map v2 with direct chapter/section members, optional blocks and partial reading structures.
- Validate typed relations, interpretation premises, high-level endpoint sets and source roll-up provenance.
- Show original paragraph text once per selected occurrence and place IDs/revisions in an inspection disclosure. Preserve v1–v3 and map v1 behavior.
- Add an original fictional fixture and regression coverage for direct members, cross-section references, loops, symmetric and isolated objects, source-only rendering and build integrity.

## 0.7.1 — nested viewport centering

- Clear old canvas scroll offsets when fitting the full graph or focusing a selected card, so the requested transform centers the intended view. Ordinary pan and zoom keep their scroll state.

## 0.7.0 — reviewed reading structure and routed relationships

- Accept `diagram-domain-model/v3` with validated `reading_structures` while retaining v1, v2 and software inputs.
- Lay out mapped core, support and independent objects for sequence, explanation, comparison and multiple-centre structures without exporting layout constraints as semantic relations.
- Pass visible frozen relationships, ports and short labels to bundled ELK and draw its routed sections; distinguish inferred relations by dashed styling, a legend and accessible text.
- Add an independent fictional v3 fixture and geometry, source-only, lifecycle and failed-build regression checks.


## 0.5.2 — 2026-09-27

- Keep v2 `details` content in a closed “更多说明” disclosure and render its tables with the same safe Markdown and strict HTML parser used for full labels and evidence.
- Translate `source_revision` in domain details and retain all original model fields without exposing table source code in the default detail view.

## 0.5.1 — 2026-09-27

- Keep long v2 labels and table markup out of cards, relation lists, breadcrumbs and SVG titles; full source text remains available in details.
- Render v2 evidence excerpts and complete labels as safe Markdown tables or strictly parsed HTML tables with spans and blank cells preserved.
- Use Chinese labels for common domain metadata and omit empty leaf summaries and empty relation metadata. V1 and software views are unchanged.

## 0.4.2

- Resynchronize domain group and saved-trace display after browser page restoration, including back navigation without select change events.

## 0.4.1

- Keep CJK node summaries inside the fixed SVG card width; show an ellipsis for truncated summaries while full labels and evidence remain available. Found during whole-chapter browser acceptance.

## 0.4.0 — 2026-09-26

- Added a drawing-target interface while preserving target-less software configurations.
- Added neutral domain graphs with object evidence, groups, saved traces, responsive lists and SVG export.
- Shared review/fingerprints/transactional build/check/preview; domain rendering needs no C4/native setup.
- Added independent domain fixtures, validation, compatibility and preview tests; native renderer versions unchanged.

## 0.3.0 — 2026-09-17

- Added optional, schema-1 `coverage` contracts for the `software-current-state` profile. Contracts declare the questions, audiences, C4/UML artifacts, evidence references, presentation, failure/recovery concerns and explicit unknowns that make a current-state model complete.
- Made missing required perspectives, invalid C4 keys/UML files/evidence references, mismatched evidence types, duplicate IDs and unknowns without reason/evidence/revisit conditions fail closed. Coverage changes invalidate review and generated output just like other declared inputs.
- Added coverage summaries to status, review records and build receipts, with `complete-with-unknowns` for evidence-backed unknown/not-applicable views.
- Added a coverage-driven semantic portal. It organizes a reader's path as purpose, boundaries, domain objects, behavior, lifecycle/recovery, then lineage/evidence/unknowns; legacy consumers without coverage retain the 0.2 portal.

## 0.2.0 — 2026-09-17

- Added `init` for conflict-safe, explicitly unreviewed consumer scaffolds and `status` for read-only model/output freshness reporting.
- Defined the Establish, Maintain, Calibrate and View conversation modes in the generic and generated project skills.
- Kept semantic review separate from scaffolding, rendering and status inspection.

## 0.1.0 — 2026-09-16

- Extracted the reviewed Structurizr and PlantUML workflow from its original development workflow.
- Added explicit project/configuration selection, project-owned adapters, engine fingerprints and an independent fixture.
- Preserved explicit review, input freshness, generated output checks and last-successful-build retention.
- Kept the existing renderer locks and macOS arm64 bootstrap. No runtime networking operations are part of the workflow.

## 0.5.0 — 2026-09-27

- Add `diagram-domain-model/v2` hierarchy validation and scoped chapter/topic/block reading to the existing domain target.
- Add separate mainline/support cards, source-only filtering of summary and relations, explicit speculative evidence details, one-hop related endpoints, source-order panel, browser history and SVG export.
- Preserve v1 group/trace views and software rendering; add independent fictional v2 fixture and regression tests.

## 0.6.0 — source-structure nested reading

- Added opt-in `presentation: nested-source` for domain-model/v2, with a separately reviewed `source-reading-map/v1` bound to the exact model bytes. Existing software, domain v1 and v2 presentations remain available.
- Added fixed ELK 0.11.0 compound layout and packaged browser runtime for an expandable chapter/section/block/occurrence SVG, source and interpretation layers, aggregate route entrances, pan/zoom, tree navigation, URL state and SVG export.
- Added strict map/reference/span checks and included map bytes in review/build/check freshness. Source paragraphs and tables use the existing safe renderer; folded routes never create model relationships.

- Nested map occurrences now require frozen block membership or an explicit related reference. Full-block details expose original members, related references and all mapped positions, including scope gaps. Long SVG titles and paragraph order labels respect card width.

## 0.6.1 — paragraph detail rendering

- Show ordinary source prose once with its exact selected span marked. HTML and Markdown tables continue to use the safe rendered template with a range marker; continuation context is unchanged.

## 0.10.0

- Add public reader-model and reader-package commands for immutable domain releases.
- Deliver a relocatable macOS arm64 app with its own standalone Node and license.
- Manage local service startup/reuse/recovery, model imports, version selection, persisted positions and diagnostics.
- Retain existing rendering, software preview and semantic review contracts.

## 0.10.1

- Hide library controls while a model is open, including on narrow screens.
- Bind producer/runtime/catalog metadata to the reading bundle identity.
- Persist original diagram pushState updates across version switches and service restarts without changing the published page.
