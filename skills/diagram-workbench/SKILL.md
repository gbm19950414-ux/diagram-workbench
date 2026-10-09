---
name: diagram-workbench
description: Create and maintain evidence-linked C4/PlantUML software diagrams or domain model diagrams with saved decision traces using Diagram Workbench.
---

# Diagram Workbench

Read the consumer's diagram configuration, selected drawing target and relevant source references. The consumer owns the model and decisions; this package owns rendering and consistency checks. Read the package README for diagram selection and `docs/configuration.md` when configuring a new consumer.

Treat the user's request as one of four modes. Ask only when the project path, source authority, or desired current/proposed state is materially ambiguous.

- **Establish**: for a new consumer, optionally run `init`; inventory its instructions and evidence before replacing the scaffold with a current-state model. Configure watch scopes deliberately. Do not record `review` for a generated scaffold.
- **Maintain**: for a requested change, identify impact on the selected model first. Update source and evidence when it changes a modelled fact; otherwise record `no-impact` with the reason. Finish the relevant tests, `review`, `build`, and `check`.
- **Calibrate**: begin read-only. Compare the model, evidence and declared watched inputs to project facts; mark unknowns rather than inventing them. If asked to repair drift, continue with the Maintain sequence.
- **View**: run `status` and `check` before `preview`. A stale, tampered, unreviewed or missing site is not a current model source.

- Start with the question, audience and drawing target. A missing `target` keeps `software-architecture`; `domain-model` uses the consumer's neutral JSON model and needs no C4 placeholders. Keep software coverage requirements on the software target. For software, use C4 for boundaries and responsibility, and PlantUML for sequence, state and mechanism views. Keep software IDs and related `@model` / `@invariant` annotations consistent.
- Check relationships against the declared evidence, including failure and recovery paths when relevant. Preserve unknowns. Split views when needed; identify where omitted detail can be found. Label exploratory alternatives as proposed.
- Update model sources and evidence with the same relevant change. Use the consumer's decision process for significant conclusions. Do not create another handwritten topology in a presentation tool.
- Run the relevant project tests; source and symbol checks are not test execution. After semantic review, record reviewer, scope and conclusion through `review`; `no-impact` requires a reason. Then `build`, `check` and inspect affected rendered views.
- A successful render or reviewed snapshot is not proof of semantic correctness or deployment. Keep operation authority and runtime facts with the consumer's existing documentation.

CLI: `diagram-workbench <command> --project <root> --config <relative-config>`. Commands: `init`, `setup`, `status`, `review`, `build`, `check`, `preview`. `init` creates only an unreviewed scaffold; `status` is read-only. The consumer may provide equivalent npm wrappers. The review flags are `--reviewer`, `--decision updated|no-impact`, and `--note`.

Software-specific additional pages belong in a declared adapter. Domain inputs use the domain target contract. Do not modify shared tool code or install global skills merely to add a consumer's diagrams. For a new consumer, build fresh evidence mappings and review records rather than copying another project's assertions.


For a domain consumer, use `init --target domain-model` only to create an unreviewed scaffold. Read the versioned domain-model contract in `docs/configuration.md`; preserve stable node/edge IDs, explicit direction, grouping/order, per-object evidence and unknown/proposed reasons. Generate this input from the consumer's published model when one exists. Do not maintain another handwritten topology or let browser code infer missing relationships.

Domain views support evidence details and saved-trace highlighting. A trace must reference existing node/edge IDs and come from a saved decision or a labelled synthetic example. No highlighted path is proof that the decision is correct. Inspect the generated portal, including narrow-screen lists and keyboard selection. Domain `setup` requires no native tools; software `setup` and native preview remain unchanged. Shared tools and their versions belong to this package; consumer semantics and review assertions stay with the consumer.

## Hierarchical domain reading (0.5)

For chapter-scale domain material, use `diagram-domain-model/v2` with explicit `root_id`, `children`, `summary` identities, and `reading_order`. Keep source facts, organization labels, and interpretation claims separately identified. Declare high-level relations with evidence, supporting edge IDs, and scope notes; do not synthesize them from element links in the browser. Use `related_element_ids` for directly relevant but unowned leaves. Review the input in the consumer before `build` and `check`; inspect default mainline cards, source-only mode, local endpoints, evidence, narrow-screen lists, keyboard navigation, and optional full SVG. The Workbench validates structure and renders declared data; semantic acceptance remains a separate review.

## Nested source reading (0.6)

Use `presentation: nested-source` with `target: domain-model`, frozen v2 model, and independently checked `source-reading-map/v1` when the reader must follow original chapter/section headings while inspecting project model objects. The map keeps original headings, paragraph order, spans, appearances, and routes separately from semantic model IDs. A section `object_id` maps a frozen topic relation endpoint only; it does not turn the source heading into that topic. Review map boundaries, summaries and release references in the consumer before using Workbench `review`. `build` and `check` verify declared bytes and references, not historical or scientific truth. Inspect initial nested chapter and leaf sections, expanded block/occurrence views, source-only filter, aggregate routes, safe original tables, evidence drawer, narrow tree, keyboard access and exported SVG. See `docs/configuration.md` and fictional `examples/source-nested`.

For explicitly reviewed discourse organization, use `diagram-domain-model/v3` with `reading_structures` and keep `source-reading-map/v1` unchanged. Declare each scope's core, anchored supports, independent objects and reading order in the consumer; the engine checks coverage and renders only mapped appearances. Do not treat layout constraints as source relations. Inspect all four patterns, real ELK paths, inferred-line styling, source-only mode and narrow-screen roles with `examples/source-structured` as a synthetic interface fixture. The semantic decision remains with the consumer's independent review.

When checking a nested map, reject occurrence ownership not declared by the frozen block's `children` or `related_element_ids`. A related occurrence remains visibly an association. Use the full-block entrance to inspect the original complete membership and all mapped positions; absent mappings mean outside the selected sample, not absent from the model.

## Typed blocks and precise relations (0.9)

Use `diagram-domain-model/v5` with the same `source-reading-map/v2` shape when a published source workflow supplies typed blocks and precise high-level relations. Preserve the six content type registry IDs and its producer SHA-256; do not infer block type from source element `kind` or reading role. Show each leaf's actual one of eight source kinds, the block's short name and content types, and its `focus_refs` with resolved values. Source references are dependencies on published fields, not separate authored facts.

Keep the four graph `relation_form` identities distinct: `source_atomic` for an existing element relation, `source_native` for reviewed source-grounded organization without a required lower edge, `source_rollup` for exact published atomic endpoint pairs, and `project_inference` for independently reviewed high-level interpretation. The latter remains an inference after review and can have no lower edge; opening it must show precise members, premises, scope and reasoning without manufacturing element relations. A source roll-up's member arrays describe the union of its listed pairs, not all possible cross-pairs. Qualifier bindings name source fields and resolved values; constituent qualifiers stay on their original pairs. Inspect collapsed identity, source-only filtering, narrow-screen relation list, keyboard use, evidence, SVG and selected-state behavior in a built fixture or consumer.


## Minimal nested reading (0.8)

Use `diagram-domain-model/v4` and `source-reading-map/v2` when original chapters or sections directly own source elements. Keep their original headings and element labels, and use blocks, summaries and reading structures only where the source supports them. A repeated appearance shares the element ID; a cross-section association needs explicit `related_element_ids` and must remain visibly unowned. Declare one of the eleven fixed relation types, direction, origin and evidence for each edge. Interpretation requires source-located premises and a concise rationale; high-level endpoints name their exact source elements. Inspect the single highlighted original paragraph, relation basis, source-only mode, narrow tree, keyboard controls and SVG. Keep semantic review with the consumer.

## Independent local reading (0.10)

Use `reader-model` with an already reviewed and checked domain site to export a versioned immutable reading model. Use `reader-package` with a declarative catalog and a standalone macOS arm64 Node runtime plus its license to build a portable double-click reader. The catalog and imported versions retain published site bytes and semantic identity; this is a runtime delivery step, not new semantic review. Follow `docs/reader.md`; inspect relocation, launch/reuse/recovery, version picker, import, evidence and saved positions in the built reader. Do not install a global daemon or include private consumer data in shared package examples.

## Section reading controls (0.11)

In the nested source view, select an original section to expand or collapse only its knowledge block containers. A selected mapped item chooses its nearest section; a relation or no selection needs a section chosen in the selector. Check URL restore, keyboard buttons, narrow source list, unaffected sibling sections, and preserved detail evidence. For v5, compare the legend's explicit, source inferred, project interpretation, and roll-up counts with the published edges. Inspect the existing rationale for source inferred claims and supporting references for roll-ups. This is a reading aid; the consumer still owns relation semantics and source review.
