import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from app.api.deps import get_current_admin, get_current_user_completed
from app.core.security import parse_uuid


class SecurityGuardTests(unittest.IsolatedAsyncioTestCase):
    def test_parse_uuid_invalid_raises_400(self):
        with self.assertRaises(HTTPException) as ctx:
            parse_uuid("not-a-uuid", field="post_id")
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_signup_guard_blocks_incomplete_user(self):
        user = SimpleNamespace(signup_completed=False)
        with self.assertRaises(HTTPException) as ctx:
            await get_current_user_completed(user=user)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_signup_guard_allows_completed_user(self):
        user = SimpleNamespace(signup_completed=True)
        result = await get_current_user_completed(user=user)
        self.assertTrue(result.signup_completed)

    async def test_admin_guard_blocks_plain_user(self):
        user = SimpleNamespace(signup_completed=True, role="user")
        with self.assertRaises(HTTPException) as ctx:
            await get_current_admin(user=user)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_admin_guard_accepts_admin(self):
        user = SimpleNamespace(signup_completed=True, role="admin")
        result = await get_current_admin(user=user)
        self.assertEqual(result.role, "admin")


if __name__ == "__main__":
    unittest.main()
