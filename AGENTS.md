# Diagram Workbench

This repository owns reusable diagram tooling, templates and operating instructions. Consumer repositories own their diagrams, evidence, decisions and review assertions. Use `skills/diagram-workbench/SKILL.md` for authoring or maintaining a consumer's diagrams; read `docs/configuration.md` before changing the configuration or adapter interface.

Keep build separate from semantic review. Preserve the previous successful site and native workspace on failed builds. Include engine, configuration, adapters and declared source inputs in freshness checks. Verify source/output changes with the independent fixture before testing a consumer. Do not add consumer paths, contracts or private data to the shared engine.

Run `npm test` and the native integration suite for engine changes. Runtime tool caches and generated pages are ignored; release source and package versions are committed deliberately. First release supports macOS arm64. Do not upgrade renderers as part of unrelated extraction fixes.
