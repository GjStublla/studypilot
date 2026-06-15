import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY: str = os.environ["SUPABASE_ANON_KEY"]
SUPABASE_SERVICE_ROLE_KEY: str = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# Anon client — used for auth operations (login, signup)
# This is safe because Supabase Auth validates credentials server-side
supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

# Service role client — used for admin operations that bypass RLS
# Never expose this key to the frontend or extension
supabase_admin: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def get_user_client(access_token: str) -> Client:
    """Return an anon client scoped to a verified user's JWT.

    PostgREST then runs as that user, so RLS (e.g. profiles' ``auth.uid() = id``)
    restricts queries to their own rows — defense in depth without the
    service-role key. Create one per request; do NOT call ``.postgrest.auth()``
    on the shared ``supabase`` singleton, which isn't safe under concurrency.
    """
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.postgrest.auth(access_token)
    return client
