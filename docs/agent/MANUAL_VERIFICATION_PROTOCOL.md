# Native manual-verification protocol

Use this protocol before asking the researcher to click, type, open, save, or visually inspect the
native application. Its purpose is to keep instructions aligned with the exact candidate instead
of relying on remembered labels or an older workflow.

## Required preflight

1. Record the candidate's About-screen build revision and the source commit it represents.
2. Locate the route in `apps/ui/src/App.tsx` and trace the active component from the user's stated
   starting screen.
3. Check every relevant feature gate and release default. A route that exists in source is not
   sufficient evidence that it is visible in the candidate.
4. Read the current component text or a current UI test for the exact visible button label and the
   heading expected after the click.
5. Check whether the requested behavior is already covered by native automation. Ask for human
   operation only for visual judgment or a boundary that automation cannot reach.

## Instruction format

Each instruction must include:

- the starting screen, identified by its visible heading;
- one exact button, tab, or menu label to use;
- the heading or visible state expected afterward;
- a stop condition if the expected control or heading is absent.

Give one bounded sequence at a time. Do not replace the current label with shorthand such as
"Graphだけ作る" when the interface says "手元の表からGraphを作る". Do not assume the user is on
Home, the current project workspace, or the compatibility entry.

## Mismatch handling

If the user reports that an item is absent, stop the sequence. Re-check the candidate revision,
route, feature gate, and current component label before giving another instruction. If the current
screen is still ambiguous, ask only for the visible page heading or tab names; do not ask the user
to explore several possible paths.

Record a repeated mismatch as either stale guidance, candidate/source mismatch, or a product
navigation defect. Do not classify it as user error.
