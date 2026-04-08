from fastapi import FastAPI

from app.api.routes import forum, profile


def _collect_routes(app: FastAPI) -> set[tuple[str, str]]:
    out: set[tuple[str, str]] = set()
    for route in app.routes:
        methods = getattr(route, "methods", set())
        path = getattr(route, "path", None)
        if not path:
            continue
        for method in methods:
            if method in {"HEAD", "OPTIONS"}:
                continue
            out.add((path, method))
    return out


def test_profile_and_forum_route_compatibility_contract():
    app = FastAPI()
    app.include_router(profile.router, prefix="/api/v1", tags=["Profile"])
    app.include_router(forum.router, prefix="/api/v1/forum", tags=["Forum"])

    routes = _collect_routes(app)

    expected = {
        ("/api/v1/me", "GET"),
        ("/api/v1/signup", "POST"),
        ("/api/v1/signup/email-code/request", "POST"),
        ("/api/v1/signup/email-code/verify", "POST"),
        ("/api/v1/me/profile", "PATCH"),
        ("/api/v1/me/withdraw", "POST"),
        ("/api/v1/me/posts", "GET"),
        ("/api/v1/me/comments", "GET"),
        ("/api/v1/users/{user_id}", "GET"),
        ("/api/v1/upload", "POST"),
        ("/api/v1/forum/me", "GET"),
        ("/api/v1/forum/signup", "POST"),
        ("/api/v1/forum/signup/email-code/request", "POST"),
        ("/api/v1/forum/signup/email-code/verify", "POST"),
        ("/api/v1/forum/me/profile", "PATCH"),
        ("/api/v1/forum/me/withdraw", "POST"),
        ("/api/v1/forum/me/posts", "GET"),
        ("/api/v1/forum/me/comments", "GET"),
        ("/api/v1/forum/users/{user_id}", "GET"),
        ("/api/v1/forum/upload", "POST"),
        ("/api/v1/forum/posts", "GET"),
        ("/api/v1/forum/board/posts", "GET"),
        ("/api/v1/forum/posts/{post_id}", "GET"),
    }

    missing = expected - routes
    assert not missing, f"Missing compatibility routes: {sorted(missing)}"
