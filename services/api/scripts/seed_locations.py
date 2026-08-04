"""Seed script to populate India → Karnataka location hierarchy.

Run with:
    docker exec naksha_geosphere-api-1 python scripts/seed_locations.py
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_session_factory
from app.modules.locations.models import Location, LocationType


async def seed_locations():
    """Create India → Karnataka location hierarchy."""
    session_factory = get_session_factory()

    async with session_factory() as session:
        # Check if already seeded
        result = await session.execute(
            select(Location).where(Location.code == "IN")
        )
        if result.scalar_one_or_none():
            print("✓ Locations already seeded!")
            return

        print("Seeding locations...")

        # Create India (Country)
        india = Location(
            name="India",
            code="IN",
            location_type=LocationType.COUNTRY,
            description="Republic of India",
            display_order=1,
        )
        session.add(india)
        await session.flush()  # Get the ID
        print(f"  ✓ Created: {india.name} ({india.code})")

        # Create Karnataka (State)
        karnataka = Location(
            name="Karnataka",
            code="IN-KA",
            location_type=LocationType.STATE,
            parent_id=india.id,
            description="State of Karnataka, India",
            display_order=1,
        )
        session.add(karnataka)
        await session.flush()
        print(f"  ✓ Created: {karnataka.name} ({karnataka.code})")

        # Create major districts in Karnataka
        districts = [
            ("Bengaluru Urban", "IN-KA-BLR", "Capital district of Karnataka"),
            ("Mysuru", "IN-KA-MYS", "Cultural capital of Karnataka"),
            ("Mangaluru", "IN-KA-MNG", "Coastal district"),
            ("Hubballi-Dharwad", "IN-KA-HDW", "Twin cities district"),
            ("Belagavi", "IN-KA-BLG", "Northern district"),
            ("Kalaburagi", "IN-KA-KLB", "Northeastern district"),
            ("Tumakuru", "IN-KA-TMK", "Central Karnataka district"),
            ("Shivamogga", "IN-KA-SHV", "Malnad region district"),
        ]

        for name, code, description in districts:
            district = Location(
                name=name,
                code=code,
                location_type=LocationType.DISTRICT,
                parent_id=karnataka.id,
                description=description,
                display_order=0,
            )
            session.add(district)
            print(f"    ✓ Created: {district.name} ({district.code})")

        await session.commit()
        print(f"\n✓ Successfully seeded {2 + len(districts)} locations!")
        print(f"  - 1 Country: India")
        print(f"  - 1 State: Karnataka")
        print(f"  - {len(districts)} Districts")


async def main():
    try:
        await seed_locations()
    except Exception as e:
        print(f"\n✗ Error seeding locations: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
