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
