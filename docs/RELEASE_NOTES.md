# GlobGap v0.1.1

Fix a false rejection of literal filenames containing repeated periods inside brace alternatives. For example, `reports/{file..old,file..new}.txt` now generates and matches the intended paths. Numeric and alphabetic ranges remain unsupported and are rejected.

Adds unit and real-Worker browser regressions, including Markdown report consistency. Verified locally: 21 Node tests and 7 browser tests passed. Picomatch remains pinned to 4.0.7; privacy, input limits and bounded-search semantics are unchanged.

[Live demo](https://billy30183-rgb.github.io/globgap/) · [Source](https://github.com/billy30183-rgb/globgap)
