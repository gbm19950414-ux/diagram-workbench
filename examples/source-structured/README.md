# Fictional structured source reading

This fixture invents a library workflow. It is a structural and UI test, not an authoritative source. The v3 model declares sequence, explanation, comparison, and multiple-centre reading structures, with core, support and independent objects. It also includes a repeated shared object, a symmetric edge, a directed loop and a marked interpretation relation. Its unchanged v1 reading-map format preserves a three-level chapter/section/subsection tree, exact paragraph spans, a continuation, HTML and Markdown tables, and escaped hostile markup. Extra appearances in the shared block exercise mapped subsets and roles; they are synthetic UI data, not factual source claims.

The comparison scope requests horizontal organization and equal core identity. A synthetic test promotes both endpoints of its symmetric relation to cores and checks that the line has no arrow, retains the frozen endpoints, and keeps cards and the relation label separate. ELK may place compared cores on different rows when directed or cyclic routes constrain the layout; the fixture does not assert a strict shared row.

Run:

```sh
node ../../bin/diagram-workbench.mjs review --project . --reviewer fixture --decision updated --note 'Reviewed this synthetic interface fixture only; no real-domain claim.'
node ../../bin/diagram-workbench.mjs build --project .
node ../../bin/diagram-workbench.mjs check --project .
node ../../bin/diagram-workbench.mjs preview --project .
```

The map SHA-256 binds the exact model bytes. Editing the model requires recomputing that map field and a fresh, honest review.

The fixture also includes a related occurrence and an unmapped frozen member. Open the complete shared block to see both its section appearances and the member marked outside this sample. The long Chinese object and block titles exercise width-bound SVG truncation while preserving their complete labels in details.
