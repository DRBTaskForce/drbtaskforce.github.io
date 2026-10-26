# WETH historical accounting recovery

The 21-event discrepancy is reconciled against successful Base transaction
receipts. Sixteen events were absent from the archived legacy API response; five
more were absent from saved incremental totals. Their exact sum is
`0.895458960433678460 WETH`. The old collector's decimal → Number → atomic-integer
round trips overstated saved accounting by `34710 wei`, explaining the observed
net difference of `0.895458960433643750 WETH`.

The archived May 13 exact anchor and subsequent saved checkpoints reproduce the
five missing events and precision loss. The missing final intermediate batch is
explicitly marked as an arithmetic reconstruction, not a retained run response.
The provider's internal reason for omitting events is not established. Advancing
only the latest cursor could not recover events indexed behind it.

`scripts/reconcile-weth-history.cjs` is an explicit offline migration. It checks
both captures, correction receipt logs, the checkpoint block and every arithmetic
step, then writes a **new output directory**. It never overwrites site data or
weakens the normal collector's exact-prefix gate. Its audit retains original
count/total, correction identities, precision adjustment and evidence digests.

The corrected baseline at block `51580414` is `2207` incoming events totaling
`161.276146113506321927 WETH`. Forty later events were separately matched to chain
receipts. The full captured replay extends the baseline through block `52980420`:
`2247` incoming events, `163.948387795646321940 WETH`.

WETH collection now uses indexed v2 events and revalidates the complete saved
prefix. New backdated evidence stops publication for reconciliation instead of
being skipped behind a cursor. Other asset histories keep their independent
status and dates; this recovery does not classify all incoming WETH as LP fees.

Evidence and independently reproducible inputs are outside the website source at
`agents/verification/wallet-chain-reconciliation-2026-10-23/` in the WAT workspace.
The new baseline and extended receipt artifacts are in `recovered-baseline/` and
`recovered-current/`. Active snapshots remain untouched. The isolated integration
build uses pinned production inputs, not the older local September data.

Fresh local checks: 154 offline tests pass, Eleventy 2.0.1 writes eight outputs,
and the saved-data/output consistency check passes. Final independent acceptance
is recorded separately in that evidence directory. No push or deployment ran.
