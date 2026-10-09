# Fictional nested source reading

This fixture invents a library workflow. It is a structural and UI test, not an authoritative source. The model includes a repeated shared object, an isolated record, a symmetric edge, a directed loop and a marked interpretation relation. Its reading map preserves a three-level chapter/section/subsection tree, exact paragraph spans, a continuation, HTML and Markdown tables, and escaped hostile markup.

Run:

```sh
node ../../bin/diagram-workbench.mjs review --project . --reviewer fixture --decision updated --note 'Reviewed this synthetic interface fixture only; no real-domain claim.'
node ../../bin/diagram-workbench.mjs build --project .
node ../../bin/diagram-workbench.mjs check --project .
node ../../bin/diagram-workbench.mjs preview --project .
```

The map SHA-256 binds the exact model bytes. Editing the model requires recomputing that map field and a fresh, honest review.

The fixture also includes a related occurrence and an unmapped frozen member. Open the complete shared block to see both its section appearances and the member marked outside this sample. The long Chinese object and block titles exercise width-bound SVG truncation while preserving their complete labels in details.
