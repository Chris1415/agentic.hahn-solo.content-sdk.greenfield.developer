---
name: feedback_consent_mandatory_with_tracking
description: "Every head app that tracks (the Content SDK default) must ship a consent implementation wired so no consent = zero tracking, consent = tracking"
metadata:
  node_type: memory
  type: feedback
---

Consent is a standard acceptance criterion for our head apps (set 2026-10-01). Because a stock Content SDK head app tracks by default (Bootstrap analytics plugin, CdpPageView, PersonalizeProxy cookies), consent is always part of the implementation, never an optional extra:

- **No consent given →** no tracking at all: no `sc_cid` / `sc_cid_personalize` cookies, no edge-platform beacons, no proxy decision call (default variant only).
- **Consent given →** tracking and personalization run normally.
- Withdrawal must stop tracking again.

**Why:** the S1 research (2026-10-01) found all six live sites shipped by then initialise tracking without consent; the SDK has no consent API, so it only happens if the build wires it in three places (Bootstrap init, CdpPageView/custom events, `PersonalizeProxy.skip`).

**How to apply:** treat a tracking-capable head app without a connected consent gate as not done; plan it in every content-sdk build and verify it with a no-consent vs consent network/cookie check.

**Decided 2026-10-01:** own first-party banner only (no third-party CMP adapter), with IAB-style categories: necessary / functional / analytics / marketing.
