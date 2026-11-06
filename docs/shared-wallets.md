# Shared Wallets

Each person signs in with their own WalletSync account. Under **공유 쿠폰함**,
one person creates a wallet and generates an invitation; the other enters that
code. A wallet has one owner and at most one guest. Both can register coupons,
edit details, mark usage, restore trash and restore earlier revisions.

The owner can replace or revoke an invitation and remove the guest. The guest
can leave. Removal retains all shared coupons and history, including records
created by the departing person. It denies subsequent server access; it cannot
revoke copies or exports already held by that person. A removed guest can clear
their unavailable wallet link before creating or joining another wallet.

Invitations contain a random UUID token, expire after 24 hours and are stored by
SHA-256 hash. Replacement invalidates the previous code. Accepting an invitation
atomically consumes it, changes membership and records the guest's wallet link.
Security rules also enforce the two-person limit, so simultaneous acceptances
cannot admit two guests. Codes are shown only after creation; generate a new one
if it is lost.

## Data and Recovery Boundaries

Personal coupons remain under `coupons/{couponId}` and are not automatically
shared. Shared coupons live under `wallets/{walletId}/coupons/{couponId}`, with
history below each coupon and duplicate reservations under the wallet's
`couponKeys`. `userId` retains the creator, while `updatedBy` and each history
entry identify the editor. Transactions archive the exact previous document;
stale revisions fail without overwriting another person's changes.

The current client links one shared wallet per account using
`users/{uid}/settings/sharedWallet`. Users can open either that wallet or their
personal wallet. Signing in selects the linked shared wallet. The personal
selection lasts for the session and is preserved through ordinary shared-wallet
updates. Membership loss returns the app to the personal wallet.

Drafts, automatic snapshots and restore checkpoints are separated by account and
wallet on each device. Switching invalidates in-flight reads and work that has
not yet been submitted. Already submitted transactions can still finish in their
original wallet. Reminder settings and brand preferences remain local account
settings. Native notifications cover the selected wallet, including coupons
created by the other member; switching reconciles the scheduled reminders.

Portable JSON/CSV backups can deliberately copy personal coupons into the selected
shared wallet, or shared coupons into another wallet/account. Imports add records,
skip duplicate identities and never transfer membership or overwrite existing
coupons. JSON can include retrievable originals; it does not contain history.
See [Recovery and Data Handling](recovery.md) for limits and failure behaviour.

## Synchronisation Failure Handling

| Failure | Retained state and recovery |
| --- | --- |
| Both members edit the same revision | One commit succeeds. The losing edit cannot overwrite it or replace its history. A server read distinguishes a stale commit from lost access, and the editor retains its draft. |
| A successful save response is lost | The committed record and duplicate reservation remain. Retrying the same identity cannot create a second coupon; reload the server list to inspect the result. An error is not proof of rollback. |
| Membership is revoked during a write | Rules reject the pending write at commit. The coupon and its history remain unchanged. |
| A deletion dialogue outlives its wallet | The original account and wallet are checked again when confirming. It cannot delete a same-ID record in the newly selected wallet. |
| A restore stops after some records were added | The complete input and checkpoint remain on the device. Retrying adds only missing identities; existing records are not overwritten. |
| Cached data or an old listener arrives late | Wallet generations reject stale work. Unconfirmed empty caches do not replace recovery snapshots. |

Transactions are never automatically rewritten against a newer revision to make
a conflict disappear. History and trash have no client-side permanent deletion.
These protections address application writes; they do not protect against every
administrator action, account loss or device failure. Independent external
backups remain necessary. Current portable backups omit revision history, and
shared originals still require the Drive work described below.

## Image and Deployment Status

Shared image references include `walletId`. Their originals remain on the device
that retained them. Shared saves do not upload to the private Firebase Storage
path. Shared cross-device image viewing and Google Drive OAuth/upload/download
are **not implemented**. A JSON import skips existing coupons, so importing a
backup is not a way to attach a missing image to an existing shared coupon.
Original-inclusive export fails if any selected original is unavailable.

The intended Drive design uses each person's own Google account and an ordinary
folder shared between them. Folder sharing is separate from WalletSync membership;
the future adapter must coordinate both permissions and test access by both
accounts. Google documents [folder permission inheritance](https://developers.google.com/workspace/drive/api/guides/manage-sharing)
and recommends the limited [`drive.file` scope](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
OAuth clients, consent configuration, native account authorisation, shared-file
access and account migration still need implementation and live verification.
No billing account or Storage bucket is required by this local metadata feature.

Deploy the tested `firestore.rules` to the intended Firebase project before using
shared wallets against that project. Local emulator results do not establish
production deployment or device acceptance. Existing clients continue using their
personal coupons and cannot see shared wallets.

## Verification

`npm run test:integration` runs the shared-wallet service and security tests with
the loopback Firestore emulator, alongside existing private-wallet and Storage
tests. It requires Java on `PATH`. The tests cover collaborative changes and
history, private-data isolation, duplicate submissions, outsider access, expired
and replaced codes, simultaneous acceptance, guest departure, removal and live
session updates. Component and service tests cover invitations, confirmation,
wallet-scoped recovery, interrupted operations and shared expiry reminders.
Fault injection pauses a real emulator transaction before commit while the other
member changes the coupon or revokes access. Another test loses the client reply
after a successful commit and verifies safe retry. These are distinct from an
actual two-device network and storage test, which remains an acceptance step.
