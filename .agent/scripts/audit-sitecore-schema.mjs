#!/usr/bin/env node
/**
 * audit-sitecore-schema.mjs — repo entry point. The implementation ships with the published
 * `content-sdk-component-review` skill (scripts/audit-sitecore-schema.mjs), so marketplace consumers
 * get the same gate; this wrapper only plugs in the products-root resolver, so a
 * logical `products/…` path resolves through the mount (product-workspace.md § 1a).
 * Flags, exit codes and waivers: see the skill copy's header.
 */
import { resolveLogical } from './resolve-products-root.mjs';

globalThis.__componentReviewResolvePath = resolveLogical;
await import('../../.claude/skills/content-sdk-component-review/scripts/audit-sitecore-schema.mjs');
