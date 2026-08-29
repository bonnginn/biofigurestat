# One-screen Experiment Canvas UI prototype

This is an isolated static prototype. It does not import production UI components, modify a saved
project, or send data anywhere.

Serve this directory through a local static server and open `index.html`. Four scenarios exercise
the proposed flow: siRNA × Dox, independent drug groups, same-entity time course, and dish-level
microscopy with lower observations.

The prototype composes an editable condition plan with a biological observation-pattern choice to
generate separate condition lists, matched matrices, repeated-axis matrices, nested raw tables, or
typed records. It includes three-state condition cells, unequal sample counts, typed positive/total
derivation, missing repeated coordinates, raw-record retention with graph exclusion, targeted
Statistics questions, and CSV/TSV paste.

`semantic-model.js` is DOM-free and has a Node regression test. The browser screen is an interaction
prototype, not evidence that first-time researchers can navigate the flow without usability testing,
and it is not connected to production save/open.
