# Benin ReCraft

Recycled craft from Benin City to the world. A web app that connects makers, recycled-material suppliers and buyers, with a marketplace partner tracker for the project team.

Live: https://benin-recraft.vercel.app

## Stack
- Static single-page app (vanilla JS, hash router), no build step
- Supabase (Postgres, Auth, Storage) with row-level security
- Vercel static hosting

## Files
- `index.html`, `styles.css`, `app.js`: the whole front end
- `vercel.json`: security headers

## Notes
- The Supabase URL and anon key in `app.js` are public by design. Access is enforced by row-level security in the database.
- Never commit a Supabase service-role key.
- Admins are listed in the `admin_emails` table and take effect once the email is confirmed.
- Checkout takes no payment yet. Paystack or Flutterwave is the next step.

## Deploys
Pushes to `main` deploy automatically on Vercel.
