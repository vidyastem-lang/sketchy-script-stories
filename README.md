# Sketchy Script Stories

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/429e2102-12c7-441a-be96-0d28de652acf).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Guest video creation

Guests are provisioned by a server function, so Supabase Anonymous Sign-Ins do not need to be enabled. Configure `SUPABASE_SERVICE_ROLE_KEY` as a server-only secret in the deployment environment. Never name it with a `VITE_` prefix or expose it to browser code. The server also needs `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, and Supabase email/password sign-in must be enabled so the server can issue the guest's normal user session.
