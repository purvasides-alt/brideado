# Bride-a-do

Steps to get this live on Vercel with Supabase storage are in the chat —
this file is just a quick reference.

1. Create a Supabase project → copy the Project URL and anon public key.
2. Run `supabase-setup.sql` in the Supabase SQL Editor.
3. Push this whole folder to a new GitHub repo.
4. Import that repo in Vercel.
5. In Vercel → Project → Settings → Environment Variables, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Deploy.

## Local development (optional)

```
npm install
cp .env.example .env.local   # then fill in your real keys
npm run dev
```
