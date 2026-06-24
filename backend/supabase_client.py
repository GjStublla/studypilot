import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY: str = os.environ["SUPABASE_ANON_KEY"]
SUPABASE_SERVICE_ROLE_KEY: str = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Anon client — used for auth operations (login, signup, token verification).
# Safe to share across requests; auth calls are stateless.
supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

# Service role client — used for admin operations that bypass RLS (e.g. sign_out).
# Never expose this key to the frontend or extension.
supabase_admin: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def get_user_client(access_token: str) -> Client:
    """Return an anon client scoped to a verified user's JWT.

    PostgREST then runs as that user, so RLS (e.g. profiles' ``auth.uid() = id``)
    restricts queries to their own rows — defense in depth without the
    service-role key.

    We create a fresh client per request rather than mutating the shared
    ``supabase`` singleton, because calling ``.postgrest.auth()`` on a shared
    instance is not safe under concurrency — one request could overwrite
    another's token mid-flight.
    """
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.postgrest.auth(access_token)
    return client
