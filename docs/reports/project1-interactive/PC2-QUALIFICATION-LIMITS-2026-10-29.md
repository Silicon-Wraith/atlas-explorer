# PC2 qualification limits after independent review

The frozen raw qualification results and review packet remain unchanged. This note annotates their scope; it changes no geometry, tolerance, sample, pass calculation or runtime admission.

Every result is finite empirical evidence. In particular, representation `fnv1a64:4b2f1f5b20858a82` has **one** forward reference sample and 512 reverse samples. Its raw row says `limits: []`; that empty list must not imply completeness. Read it with this explicit limit: **one forward sample does not establish complete reference coverage of this region**. The report and archived summary carry this annotation.

The exact retained BW1 region143 now has three forward samples and 512 reverse samples. This addresses the former zero-reference omission with additional finite evidence, while its coverage remains sparse. The old zero count and its valid reverse checks stay preserved. No reference minimum was added as a new success gate, and no region was changed to improve the result.

The 16 unique qualified representations are **three coarse surfaces, ten coarse air regions, one fine surface and two view surfaces**. No full-solid specimen was generated in these runs; full-solid behavior has CPU controls rather than hardware specimen evidence. Air classifications have finite occupancy samples, not a proof that no unresolved mathematical feature exists anywhere in the cube.

Live artifacts correctly carry zero instance sample counts and explicit policy-only qualification limits. The later CPU checks do not retroactively become runtime readiness work. All qualifications are limited to the stated immutable source/policy and sampled regions, and do not establish the whole 455-address domain or a continuous topology guarantee.
