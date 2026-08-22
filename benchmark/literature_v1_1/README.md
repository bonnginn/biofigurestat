# Literature benchmark v1.1

`source/LSA_Literature_Benchmark_50_v1_1.xlsx` is the unchanged authoritative provenance file.
Its SHA-256 is `028c6f5639c98bf50e4a6a87c25b04defa1c89ddda8b063624d6746188aa5bf5`.

Regenerate the deterministic runtime representation from the repository root with:

```powershell
.\engine\python\.venv\Scripts\python.exe scripts\import_literature_benchmark.py
```

The converter creates separate Experimenter views. Track B receives only the scientific researcher
packet fields and synthetic rows. In particular, the workbook's `scope_expectation` field is not
included because it reveals expected support scope. Track A additionally receives the curated paper
reference but never gold metadata. Reviewer and integrator layers remain server-side and are not
served by the Experimenter API.

The runtime files are derived data. Do not edit them manually; change only by replacing the
authoritative workbook with an explicitly versioned source and rerunning validation.
