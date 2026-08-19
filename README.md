# GRID

Tennessee county situation monitor — map, news, markets, crime, sit briefs.

- Latest build: https://daisy-opal-arch-summit.grok.me
- Production domain: https://grid.blakehassler.com

## Put this version on grid.blakehassler.com

DNS is already pointed at Vercel. No DNS change is required.
The existing Vercel project `grid` on team **bhas123's projects** owns that domain.

1. Install the Vercel GitHub App and grant it `bhas125/grid`:
   https://github.com/apps/vercel
2. Open the existing project:
   https://vercel.com/bhas123s-projects/grid
3. **Settings → Git → Connect Repository** → choose `bhas125/grid`.
4. **Deployments → Create Deployment** from branch `main`, environment **Production**.

That replaces the old static/patched build with this repo and keeps `grid.blakehassler.com`.

If Git is already connected to an older repo, disconnect it first, then connect `bhas125/grid` and redeploy production.

