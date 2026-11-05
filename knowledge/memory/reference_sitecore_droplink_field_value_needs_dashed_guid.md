---
name: reference_sitecore_droplink_field_value_needs_dashed_guid
description: "Writing an item GUID into a Droplink/Droptree/Page-Design field via Authoring GraphQL must be DASH-formatted, or the reference silently fails to resolve"
metadata: 
  node_type: memory
  type: reference
---

When setting a **Droplink / Droptree / Page-Design** field value through raw Authoring GraphQL (updateItem `fields:[{name, value}]`), the GUID must be **dashed + braced** — `{03386E32-8A10-4F76-8196-C3B747CAB26C}`. The Authoring GraphQL API returns `itemId` **without dashes** (32 hex chars, e.g. `03386e328a104f768196c3b747cab26c`); writing that raw value into a link field silently breaks Sitecore's selection-list match. Pages shows **"Value not in the selection list"** and the reference does NOT resolve — e.g. a page's **Page Design** field set dash-less → the page never picks up its Partial Designs, so **header/footer chrome renders empty** (in Pages preview AND Edge).

Symptom is easy to misdiagnose as "fresh schema chrome needs publish" — it does NOT. A site recreate (2026-07-14) hit exactly this: Home/Health/Contact Page Design was written dash-less by the content agent; chrome was empty until the field was rewritten dashed (operator caught it in Pages: re-selecting the design from the dropdown rewrites it dashed). Fix = format every GUID with dashes before writing it into a link-type field value. Applies to `s:ds`/datasource refs too, though those are usually already dashed in layout XML.
