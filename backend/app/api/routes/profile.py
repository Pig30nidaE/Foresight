from fastapi import APIRouter

from app.api.routes import forum

router = APIRouter()

# Profile/Auth-like endpoints (separate from forum board endpoints)
router.add_api_route("/me", forum.get_me, methods=["GET"])
router.add_api_route("/me/profile", forum.update_my_profile, methods=["PATCH"])
router.add_api_route("/me/posts", forum.get_my_posts, methods=["GET"])
router.add_api_route("/me/comments", forum.get_my_comments, methods=["GET"])
router.add_api_route("/users/{user_id}", forum.get_user_public_profile, methods=["GET"])
