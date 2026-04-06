type UserIdentity = {
  public_id?: string | null;
  id?: string | null;
};

export function userProfileHref(user: UserIdentity): string {
  const target = user.public_id ?? user.id;
  return target ? `/user/${target}` : "/";
}
