# PC3 finite qualification and sparse forward references

The original `application-r0/qualification.json` is preserved unchanged. Nine representations pass its finite checks: five surface/view and four air specimens. Every surface/view specimen has512 reverse mesh samples. Their forward-reference counts are608,826,**1**,760 and655; every air specimen has1,024 occupancy samples. These establish sampled agreement, not complete geometry, global topology or complete air/solid classification.

Coarse surface `fnv1a64:4b2f1f5b20858a82` has only one forward-reference sample. Its raw `limits: []` field does not express that sparsity. The owner report and archived evidence summary add an explicit annotation; neither alters the original output or upgrades the evidence. The qualification tool should emit a sparse-reference annotation directly when next modified. This is a metadata obligation, not a new failure criterion or a reason to erase its valid reverse checks.

Live runtime admission still uses the retained empirical policy certificate and zero instance sample counts. Post-run qualification happened offline and is not presented as work performed before admission. Matching selected render/collision keys follows the single-active-region construction; it is not an independent visual equivalence test.

Raw source/qualification hashes and the derived summary annotation are included in the PC3 evidence manifest. The [full scorecard](PC3-APPLICATION-ENTRY-2026-10-29.md) records every original target, scope amendment and unresolved question.
