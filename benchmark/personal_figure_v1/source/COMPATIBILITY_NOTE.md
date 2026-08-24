# Compatibility Note — LSA Literature Benchmark 495 v2

The personal benchmark preserves the 495 benchmark's core separation model:

- Researcher_Packets
- Paper_Reference
- Gold_Metadata
- Raw_Data (compatible with the 495 Synthetic_Raw long-form fields)
- Gold_Analysis
- QC and physically separate Track B export

Intentional extensions:

- Gold_Figure_Metadata captures axes, grouping, legend semantics, error bars, paired lines, repeated traces, and annotations.
- Gold_Comparisons stores explicit planned/post-hoc contrasts and multiplicity handling.
- Source_Asset_Index distinguishes publication summaries, source assets, and tabular raw availability.
- Excluded_Panels preserves exclusion decisions.
- Raw_Data adds target/reference/derived lineage fields for Western blots and explicit pair IDs.

Track B excludes publication identity, Figure/panel identifiers, published statistical methods, Gold answers, support/difficulty labels, and Figure metadata.
