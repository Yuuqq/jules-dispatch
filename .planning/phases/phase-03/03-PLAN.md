# Plan: Collector Error Surfacing

**Phase:** 3 — Collector Error Surfacing
**Mode:** inline
**Depends on:** Phase 1 (deriveStatus verified)

## What

Replace two silent catch blocks in collector.ts with logged, contextual error handling. No behavior change — errors are caught and processing continues — but now they're visible in verbose/debug output.

## Plan 03-01: Replace silent error swallowing

### Fix #1: Activity fetch error (collector.ts:80-83)

Current:
```typescript
} catch {
  lastActivity = 'Error fetching activities';
  status = deriveStatus(session, []);
}
```

Fix:
```typescript
} catch (err) {
  debug('activity fetch error', { sessionId: session.id, error: (err as Error).message });
  lastActivity = 'Error fetching activities';
  status = deriveStatus(session, []);
}
```

### Fix #2: Wait polling error (collector.ts:221-223)

Current:
```typescript
} catch {
  // Transient — keep polling.
}
```

Fix:
```typescript
} catch (err) {
  debug('wait poll error', { sessionId, error: (err as Error).message });
}
```

### Tests

Add test describe block for error logging in collector. Mock JulesClient methods to throw, verify:
1. Activity fetch error → result still returned with 'running' status, debug called with session context
2. Wait poll error → polling continues, debug called with session ID
3. No empty catch blocks remain in collector.ts (grep assertion)

## File

- Modify: `src/collector.ts` (2 catch blocks)
- Extend: `tests/collector.test.ts` (new)

## Verification

1. `npx vitest run` — all tests pass
2. `grep -c 'catch {' src/collector.ts` returns 0 (no empty catches)
3. `npx tsc --noEmit` passes
