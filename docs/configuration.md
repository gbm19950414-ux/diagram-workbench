# Configuration and adapter contract (schema 1)

Use `examples/minimal/diagram.config.json` as the smallest complete configuration. The default `software-architecture` target requires `workspace`, `uml`, `evidence`, `toolchain`, and `review`. Explicit `domain-model` requires `model`, `evidence`, and `review`; it does not read a DSL or native toolchain. Unknown target names fail. `output` defaults to `.architecture`. Configuration, input, review and output paths are relative to the explicit project root, not the process working directory. Inputs reject absolute paths, traversal and symlinks; `deniedPaths` adds consumer-owned exclusions. Model and output directories must be separate.

`inputs` lists additional files to fingerprint. `watch` contains objects with a `directory` and optional `extensions` array. `rootExtensions` adds matching files immediately under the project root. Sources declared in the evidence manifest, all UML files, the DSL, toolchain lock, configuration and adapter are automatically included. The engine's packaged code and instructions appear under the reserved `$engine` fingerprint key; it is not a source filename. Exclude generated output, review records and vendored dependencies from watched directories. Missing watched directories contribute no files; missing explicit inputs fail.

`portal` optionally provides `title`, `intro`, `navigation` (`href`, `label`), and `supplementDiagrams` (UML basenames shown by project pages instead of the main page). `preview.port` / `preview.nativePort` default to 8765 / 8766, on 127.0.0.1 only.

### Coverage contracts (0.3)

`coverage` is optional and names a project-relative JSON file. When absent, the 0.2 configuration, portal and review behavior are unchanged. When present, it is a fail-closed schema-1 contract:

```json
{
  "schema": 1,
  "profile": "software-current-state",
  "audiences": ["project-author", "maintainer-agent"],
  "perspectives": [{
    "id": "request_lifecycle",
    "section": "behavior",
    "question": "How do requests fail and recover?",
    "kind": "state-lifecycle",
    "status": "modelled",
    "artifact": {"type": "plantuml", "file": "request-state.puml"},
    "evidence": [{"id": "lifecycle_contract", "type": "decision"}],
    "presentation": "embed",
    "concerns": ["failure", "recovery"]
  }]
}
```

The `software-current-state` profile requires the two named audiences and one modelled perspective of each kind: `c4-system-context`, `c4-container`, `domain-class`, `sequence`, `state-lifecycle` and `data-lineage`. Across perspectives it must declare `failure` and `recovery` concerns. `section` is `boundaries`, `domain`, `behavior` or `assurance`; `status` is `modelled`, `unknown` or `not-applicable`; `presentation` is `embed` or `link`.

Modelled C4 artifacts use `{ "type": "structurizr", "viewKey": "..." }`, must match a declared DSL view and are linked rather than rasterized. Modelled UML artifacts use `{ "type": "plantuml", "file": "..." }`, must exist, and must render as the declared domain/sequence/lifecycle/lineage type. Evidence references name an evidence-manifest source ID; an optional reference `type` must equal the source `type`. `unknown` and `not-applicable` perspectives have no artifact and require non-empty `reason`, evidence and `revisitWhen`.

Coverage contracts make `portal.supplementDiagrams` invalid: a required view cannot be hidden by a second display mechanism. The generated portal renders every perspective exactly once in semantic reading order. Status, explicit review records and receipts carry a coverage summary. A valid contract with unknown/not-applicable perspectives reports `complete-with-unknowns`; it never claims those statements are modelled facts. A build cannot refresh review. Any coverage or declared artifact/evidence change makes the existing review and site stale.

The evidence manifest retains `sources` (IDs mapped to path/label), `elements` (DSL IDs mapped to source IDs), and `invariants` (text, source IDs and test references). The first release supports the current named C4 declarations for persons, software systems, containers, components and deployment nodes; native Structurizr validation still runs. A source reference is an association, not proof of a claim. UML `' @model ...` and `' @invariant ...` annotations link named objects across views.

`adapter` optionally names one self-contained trusted project ESM module. It is project code, not a sandboxed plugin. Its supported exports are:

```js
export function checkTest({text, reference}) { /* return boolean */ }
export function renderPages({resources, diagrams, docs, docName, esc, page}) {
  return {'handbook.html': page('Title', '<section>...</section>')};
}
```

`checkTest` receives the declared source text and test reference. If test references exist without a checker, validation fails. Python-specific symbol matching belongs in the consumer. `renderPages` receives declared input text keyed by project-relative paths, diagram text keyed by basename, declared Markdown paths, and helpers for source links/HTML escaping/page layout. It returns relative HTML filenames mapped to HTML strings. Output collision, traversal and non-HTML output fail the build. These pages enter the same output receipt and transaction as standard pages.

Adapters should be pure renderers/checkers: use only supplied content and standard language helpers; do not fetch, read undeclared files, run external commands or write sources. Declare additional text assets in `inputs`. The adapter's own bytes are fingerprinted. User-authored DSL/UML likewise use self-contained diagram source in v1; executable directives and external resources are outside the supported offline profile.

`init --project ROOT [--title NAME]` creates an unreviewed scaffold only when the target configuration and initial model paths do not already exist. It deliberately watches no broad project directories: the establishing pass must choose evidence and `watch` scopes from the real repository. It creates a project-level `architecture-model` skill that names the four conversation modes. `status` parses the current input snapshot and existing receipt without running renderers; it reports `needs-review` / `reviewed-snapshot` plus `not-built`, `stale-inputs`, `invalid-output`, or `verified` output state.

Review schema remains compatible with existing assertions. New engine fingerprints naturally make older reviews stale. Receipt schema 2 adds `engineVersion`; its `inputs` includes `$engine`. Consumers must skip this reserved key when copying source files. Review exclusion is intentional to avoid a self-referential hash. The package exports `createWorkbench({project,config})` and `initializeProject({project,config,title})`; `main(args)` supports `setup`, `status`, `review`, `build`, `check` and `preview`. The `diagram-workbench/checks` subpath exposes pure check helpers for consumers migrating existing tests; retain these exports throughout 0.2.x.


## Drawing targets (0.4)

Existing schema-1 configurations without `target` retain the software-architecture target and native C4/PlantUML lifecycle. `software-current-state` coverage is unchanged and belongs to that target. `target: domain-model` selects a separate neutral representation; it does not weaken the software coverage contract or create C4 placeholders.

```json
{
  "schema": 1,
  "target": "domain-model",
  "model": "model.json",
  "evidence": "evidence.json",
  "review": "review.json",
  "output": ".diagrams",
  "inputs": [],
  "watch": []
}
```

A domain model is a `diagram-domain-model/v1` JSON document with `title`, `nodes`, `edges`, optional `groups` and optional `traces`. Each node and edge has a stable `id`, `label` and nonempty `evidence` array naming manifest source IDs. Edges additionally have `from`, `to` and explicit `direction` (`directed`, `symmetric`, `undirected`). IDs are ASCII letters/digits plus `.`, `_`, `:`, `-`, beginning with a letter or digit. IDs are unique across nodes, edges, groups and traces. Optional `kind`, `details`, `origin`, `order` and structured metadata are consumer-owned meaning. `origin: interpretation` uses a dashed line; it does not become an author assertion after review. `status: unknown|proposed` requires a reason. Missing status means a modelled item, not automatic semantic approval.

Groups have `id` and `label`; nodes may name a group. A group view shows its nodes and directly connected endpoints, without expanding a second hop. `order` is a stable layout tie-break, not an execution relation. Components, cycles, isolated nodes and symmetric lines are retained. Traces have `id`, `label`, `description`, `node_ids` and `edge_ids`; all references and endpoints must exist. They represent previously saved decisions or explicitly fictional examples. The browser only highlights those IDs and never computes a new decision.

The evidence manifest requires `sources` entries with `path` and `label`. `invariants` and old `elements` mappings are optional. Node/edge evidence in the model is authoritative for mapping; a supplied `elements` map must agree. Sources are declared text snapshots: Markdown becomes a rendered document, other text becomes an escaped source viewer. Every node and relationship opens its exact source links. Invariants with test symbols still require a consumer `checkTest` adapter. Association with evidence is not proof of meaning.

Domain `setup` validates inputs and reports that no native setup is needed. `build` renders packaged SVG/HTML without Java, Graphviz or Structurizr. `preview` starts only the shared static server; software preview retains both servers. The domain model can be a root JSON file, but must not be inside its generated output directory. All declared input and target implementation bytes participate in the same review, receipt and transaction mechanisms. Rebuilding does not refresh review; invalid models and failed publication retain the previous site.

`init --target domain-model --project ROOT [--title NAME]` creates an unreviewed model and scope under `docs/model`. It does not claim consumer facts or produce a review. The CLI commands and trusted consumer adapter interface remain the same. Targets in `src/targets.mjs` implement `validateTargetModel` and `renderTarget`; adding targets should reuse core publication rather than duplicate it. The target registry is packaged code, not an arbitrary dynamic plugin loader.

The domain portal supports all/group views, keyboard selection, per-node/per-edge source details, saved trace highlighting, a complete narrow-screen list and export of the current SVG. See `examples/domain-model` (fictional equipment workflow) and `examples/domain-training` (fictional training-labelled workflow). Neither fixture is a real prescription.

## Hierarchical domain model (0.5)

`target: domain-model` also accepts `diagram-domain-model/v2`. The same review, snapshot, transaction, `build`, `check`, and static preview apply. V1 group views and the software target retain their prior behavior. See `examples/domain-hierarchical` for an independent fictional fixture.

V2 adds required `root_id` and `reading_order` to the model. `root_id` names a chapter node. `reading_order` lists every leaf ID exactly once in source order; it is separate from hierarchy/card order. Chapter, topic, and block nodes declare `children` IDs. The hierarchy is a reachable DAG: shared children are allowed, duplicate child IDs, self links, cycles, and unreachable nodes fail. A breadcrumb records the path actually followed. `role: mainline|supporting` separates chapter core cards from support cards; absent role appears in the core group. Navigation nodes are labelled as reading organization.

Every node and edge retains v1 ID, label, and evidence. Node `origin` may be `source`, `interpretation`, or `organization`; `summary` is an array of `{id,text,origin,evidence}` with IDs unique inside that node and origin `source|interpretation`. Source-only mode removes interpretation summary items, leaves, and edges while retaining organization cards. An empty filtered summary is stated as unavailable. Blocks may declare `related_element_ids`: explicit leaf references visible as related endpoints even when no edge connects them; they never become owned children. Relationships are shown only where declared. All edges need `origin: source|interpretation`; `supporting_edge_ids` references existing edges and `scope_note` limits an aggregate claim. A source aggregate cannot cite an interpretation edge. Interpretation edges carry human-readable `rationale`, nonempty `premises` source-reference objects, and `uncertainty`.

The default page shows chapter cards and a local graph of immediate children and one-hop related endpoints. Topic and block pages use the same rule. Cards, graph objects, relation lists, and evidence details are keyboard accessible. The narrow view supplies a complete card and relation list. The layer and optional full-model controls, breadcrumb, browser history, and SVG export use the declared model only. Each source in the evidence manifest may add frozen `excerpt` and `location` text for inline evidence; its path is still rendered from declared project input. The browser does not infer semantics or fetch external content.

### V2 reading presentation (0.5.1)

Navigation cards, relation lists, breadcrumbs and SVG use a mechanical first-paragraph label preview with an omission marker. The model `label` and evidence excerpts remain complete and can be expanded in the detail panel. Pipe tables use the packaged Markdown renderer with raw HTML disabled. HTML tables use a strict table/row/cell parser that permits only numeric `rowspan` and `colspan`; unsupported markup is escaped. Empty cells and cell spaces remain visible. Common node kinds and source-reference fields have readable Chinese display labels. These changes affect v2 presentation only.

In 0.5.2, optional v2 `details` text and structured fields are shown only under the closed “更多说明” detail disclosure. String values use the same safe table presentation as labels and excerpts; source data is never rewritten.

## Nested source reading (0.6)

Set `target: "domain-model"`, `presentation: "nested-source"`, and a safe project-relative `readingMap` path. This mode accepts `diagram-domain-model/v2` or `/v3`; other modes and software configuration are unchanged. The map is automatically fingerprinted with its config, model, evidence, declared input files, and packaged engine. `review`, `build`, `check`, and `preview` keep their existing meanings and transaction rules.

`source-reading-map/v1` requires `schema_version`, `title`, `model_sha256` (SHA-256 of exact model file bytes), `root_id`, `author: {identity,model}`, `containers`, `occurrences`, `paragraphs`, and `edge_routes`. Optional `source_release` records `{artifact_revision_id,export_sha256,model_sha256,organization_sha256,transcription_sha256}`; optional `metadata.boundary_review_ref` identifies the separate boundary review. The tool checks shape and references, not the truth of those claims. An unknown model identity may be recorded as `"unknown"`.

A container has `{id,parent_id,kind,title,order,evidence}`. Kinds are `chapter`, `section`, `block`. The unique root is a chapter with null parent. Sections may nest under chapters or sections to preserve source headings; blocks belong to sections. A block requires `object_id` of a frozen model block. A section may use `object_id` of a model topic strictly to route an existing model relation; it does not claim the source heading and project topic are identical. Containers may add `summary:{text,origin,evidence}` and `range:{start:{paragraph_id,offset},end:{paragraph_id,offset}}`. Map summaries are independently reviewed; source-only hides interpretation summaries. If no map summary exists, model summary items appear using their original text and origin.

An occurrence has `{id,parent_id,object_id,order,spans:[{paragraph_id,start,end}]}` and belongs to a block. Repeated `object_id` values express multiple appearances without copying model objects. A paragraph has `{id,locator,order,text,evidence}` and optional `continues_from` paragraph ID. `order` is the checked snapshot array order, not a number parsed from a locator; duplicate occurrence sort keys are allowed. Span offsets use Unicode code points, zero based, end exclusive. The full paragraph text is rendered from the map, with exact spans marked and continuation fragments available. Raw HTML is disabled except strictly parsed table/row/cell markup with numeric row/column spans.

An edge route is `{edge_id,from_id,to_id}`. Each endpoint is an occurrence or an object-mapped container; its `object_id` must exactly match the frozen edge's `from` or `to`. A route maps where an existing edge appears and never creates a new edge or high-level claim. Multiple routes may reference the same edge for repeated appearances. Folded endpoints become explicit aggregate entrances with counts and original edge details; internal routes use one container badge. Only a route with both true endpoints visible shows the relation's semantic label. Source-only removes interpretation routes and interpretation occurrences. Direction comes from the frozen edge, including symmetric and undirected relations.

The initial SVG expands the chapter and directory-only intermediate sections, keeping selected leaf sections and their full summaries visible while blocks remain folded. The same page offers an always visible source tree, location path, side evidence drawer with full safe text and source links, pan/zoom/fit/focus, URL/history state, keyboard activation, narrow-screen tree and relation list, and SVG export. ELK 0.11.0 and its browser bundle are packaged with the npm tarball; no CDN is used. The synthetic `examples/source-nested` fixture covers a nested source heading, repeated object, isolated object, directed loop, symmetric edge, interpretation route, HTML and pipe tables, and escaped hostile text.

Occurrence ownership is checked against its mapped block's frozen `children` or `related_element_ids`. A related occurrence is labelled “关联引用，非本块成员” in the graph, tree and detail. An occurrence with neither declared membership nor explicit related reference is rejected. “打开完整知识块” reads the original block's full `children` and `related_element_ids`, lists every mapped appearance (including other sections), and marks absent mappings “本小样范围外”; it does not copy or synthesize objects. Graph kind lines display paragraph `order` from mapped spans or range starts, never the enlarged sorting key used by a source producer. Long titles use at most two lines sized for the SVG's actual 15px font, with omission indicated and full text retained in details.

### Reviewed reading structures (0.7)

`diagram-domain-model/v3` requires `reading_structures`, which may cover selected scopes only. Each structure declares `{id,scope_id,pattern,core_ids,supports,independent_ids,reading_order,evidence,rationale}`. `pattern` is `sequence`, `explanation`, `comparison`, or `multiple`; each support is `{node_id,anchor_id,role}` with `role` one of `condition`, `parameter`, `reason`, `example`, `detail`, `exception`. The core, support and independent IDs partition the scope's direct child topics/blocks/source elements and a block's explicit related elements; `reading_order` lists that same universe once. Sequence and comparison need at least two cores; explanation needs at least one; multiple may have none. The engine validates these references and evidence IDs, while the consumer owns the independent review of the claimed organization.

The nested view matches a structure to a container's `object_id`, or to `model.root_id` for the map root without an `object_id`. It lays out only mapped occurrences and never manufactures absent members. Core/support constraints guide placement inside the existing source hierarchy; they do not become semantic edges, relationship counts, or evidence. Real visible `edge_routes` are passed to the packaged ELK with ports and labels in one layout pass, then rendered from its returned sections and label positions. Directed, symmetric, and undirected identity remains from the frozen model. Folded routes still open the exact underlying relations. The SVG uses solid source lines and dashed rust-coloured interpretation lines with an accessible label; the relation list uses a short “推测” badge. The tree names core/support roles on narrow screens. The fictional `examples/source-structured` fixture exercises all four patterns, repeated appearances, disconnected objects, loops, symmetric and cross-container routes.

`comparison` requests a horizontal direction and gives every declared core the same visual role. This is an intent for parallel reading, not a strict same-row guarantee: directed relations, cycles, and cross-container routing can move cores to different rows in ELK. The layout never changes the model's relation direction to make a comparison look parallel. The fixture checks equal core styling, arrow-free symmetric edges, exact semantic endpoints, and non-overlapping cards and edge labels; actual reading order and relationship meaning remain in the declared structure and frozen model.


### Minimal nested source reading (0.8)

`diagram-domain-model/v4` with `source-reading-map/v2` supports source chapters and sections that directly contain element nodes. A `block` and `reading_structures` are optional; an empty structural container does not enter `reading_order`. Existing v1–v3 models and map v1 retain their validation rules. See the original fictional `examples/source-minimal-v4`.

A v4 chapter or section has its original heading as `label`, `children`, and source evidence. Element `label` stays verbatim; repeated occurrences share its ID and `source_revision`. `reading_order` lists semantic leaves once. `related_element_ids` on a chapter, section or block declares associated but unowned elements, which a map v2 occurrence may reference. A v2 container can map its `object_id` to a model chapter, section or block of the same kind. An occurrence may belong directly to any mapped chapter, section or block, and its object must be a direct child or declared related element of that parent. Existing paragraphs, spans, routes and exact model-byte SHA-256 binding are unchanged.

V4 edges require a `type` and fixed short `label`: `conditions` 条件, `exception_to` 例外, `replaces` 替代, `supports` 支持, `precedes` 先于, `quantifies` 量化, `example_of` 示例, `qualifies` 限定, `causes` 导致, `contrasts_with` 对照, `elaborates` 阐释. `contrasts_with` is symmetric; all others are directed. `origin` remains independent of `type`. Interpretation edges require a concise `rationale` and nonempty `premises` with `source`, `object_id`, `content_revision`, and `field_path`; `uncertainty` and `scope_note` are optional. A chapter, section or block edge endpoint requires a nonempty `from_element_ids` or `to_element_ids` set of actual descendant or declared related leaf IDs. High-level source roll-ups require `supporting_edge_ids` with the same type, direction and exact endpoint sets.

A declared v4 reading structure may assign only part of its actual scope. `core_ids`, `supports`, `independent_ids`, and `reading_order` may be omitted or empty; unassigned members stay in source order. Support anchors remain distinct declared cores and pattern minimums still apply when a pattern is declared. The view shows one highlighted original paragraph for an occurrence, relation endpoints and original evidence for a relation, and folds IDs/revisions into inspection. It retains the source tree, direct element layout, source-only filter, keyboard controls, narrow lists and SVG export.

### Typed blocks and exact relation identity (0.9)

`diagram-domain-model/v5` uses the v4 hierarchy and `source-reading-map/v2` unchanged, including the exact model-byte hash. Its top-level `content_types` is the producer's `semantic-content-types/v1` registry with a SHA-256 of the producer's bundled registry file and the six fixed IDs: `plan_process`, `concept_principle`, `parameter_constraint`, `argument_explanation`, `comparison`, `example`. Every block supplies nonempty registered `content_types` and `focus_refs`; `focus_rationale` is optional. A leaf keeps its source `kind`: `assertion`, `action`, `condition`, `exception`, `reason`, `parameter`, `example`, or `unresolved`. Reading roles style cards without changing kind. The consumer remains responsible for validating source revisions and field values against its published source objects; Workbench checks the graph's structure, evidence IDs and reference syntax.

Every v5 edge declares one `relation_form`. `source_atomic` names an existing element relation and retains its origin, including interpretation when the published source relation is itself interpretive. `source_native` is a reviewed source-grounded high-level relation with exact `from_element_ids` and `to_element_ids`, direct source `premises`, `basis: explicit|inferred_from_source`, and a `scope_note`. `source_rollup` names source atomic `supporting_edge_ids` with matching type, direction and origin, exact `endpoint_pairs`, and member arrays equal to the union of those pairs. Symmetric pairs may be aligned in reverse; directed pairs may not. `project_inference` names precise members, source `premises`, `overall_effect`, `rationale`, and `scope_note`, with `uncertainty` only when relevant. It remains dashed and hidden in source-only mode even after independent review. High-level native and inferred relations may have no lower edge. A member array does not authorize drawing all cross-pairs.

Qualifier bindings use `applies_to: from|to|relation`, `dimension: condition|time|modality|scope`, and `source_ref` to a published field. References carry `object_id`, JSON Pointer `field_path`, and 64-hex `content_revision`; the exported graph may include resolved `source` and `value` for display. A roll-up-level qualifier must be identical on every constituent; otherwise qualifiers remain only on their individual endpoint pairs. Folded links keep relation type, direction, origin, form and qualifier identity separate; opening a link lists its real edge IDs, exact endpoint members or pairs, resolved premises and qualifiers. See the original non-training `examples/source-block-v5` fixture.

In 0.9.1, an explicitly mapped roll-up represents its supporting atomic edges only while those atomic routes are folded to the same visible endpoints. The roll-up's details retain each pair and a control to inspect its atomic edge, including qualifiers from that edge. Expanding the actual occurrences restores the atomic routes. Native source and project inference edges are independent and are never suppressed by this rule.

In 0.9.2, a folded container with several internal relations shows one neutral “内含N条关系” entrance. It is a list entrance over existing edge IDs, not a new self-relation. Opening it lists each actual type, origin, endpoint and applicable qualifiers. Source-only recounts from source edges. Cross-container lines show the actual type and a count only when several relations are grouped; “部分成员” marks declared high-level endpoints that select less than the container's eligible leaves. Exact member counts and names remain in relation details. Form identities remain inspectable there rather than repeated on every line.

In 0.9.3, selecting a multi-relation entrance opens a compact list first. Each relation can then be opened individually. Endpoints and exact members use short object buttons, which lead to the complete published text and evidence when needed; long tables are not repeated in relation lists. Resolved source fields keep complete values in closed details when long, and the enum value `possible` displays as “可选”. IDs and revisions remain in the technical details.

In 0.9.4, the narrow-screen source tree follows normal page flow with no height cap, so it does not overlap the relation list. The desktop tree remains sticky and independently scrollable.

In 0.9.5, v5 narrow-screen tree entries show the source element kind or block content type, with the same type in the accessible name; these are distinct from reading roles. A resolved reference shows its value once and keeps a source link. For the published quantity shape, amount and unit appear with basis and scope; other object shapes remain unchanged JSON.

When every exact supporting atomic endpoint pair of a source roll-up is directly visible, the roll-up route leaves the graph and relation list so the same facts appear once as their atomic routes. Partial expansion keeps the roll-up route available for the remaining range; the model edge and its exact pairs remain unchanged. Native source and independent project inference routes are unaffected.

### Current source section and relation identity (0.11)

The nested source reader offers a “当前原书小节” selector. Selecting a mapped item chooses its nearest original section. While a mapped item within a section is selected, the selector reflects that nearest section and is locked; choose another item in the tree to change scope. Selecting a relationship, model object, full block, or clearing the detail enables an explicit section choice before batch controls run. “展开本节知识块” and “收起本节知识块” change only block containers whose nearest section is that section. They leave the section, its ancestors, other sections, non-block elements, selection, and evidence untouched. A collapsed block retains any previously expanded child state. The chosen section and open IDs are saved in the URL hash. Native buttons and select work by keyboard and in the narrow source list. The existing map contract still disallows block containers inside block containers.

For v5 relations, the legend counts published edges by `origin` and `basis`: explicit, inferred from source, and project interpretation. A source roll-up is counted separately because `basis: source_rollup` does not assert one of the first two categories. Zero project interpretations display “本版本无补充推测关系”. Relation details put basis identity and form on one line. An inferred source relation shows its published `rationale`; roll-ups display the count and links to their declared supporting edges. Graph labels still use the published relation label and inferred routes remain dashed. These controls do not create or change relations.
