"""Constants shared across the authentication module.

`ROLE_OPTIONS` mirrors the exact `<option>` values in
`frontend/src/components/auth/SignupForm.tsx` — there is no automated
sharing between the Python backend and the TypeScript frontend, so keep
both lists in sync by hand.
"""

from __future__ import annotations

ROLE_OPTIONS: frozenset[str] = frozenset(
    {
        "gis-analyst",
        "researcher",
        "developer",
        "data-scientist",
        "engineer",
        "manager",
        "other",
    }
)
