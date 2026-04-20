# Contabo VPS Setup

This project is prepared to run on a single Contabo VPS with:

- Docker Compose
- Caddy for HTTPS
- Postgres for persistent app data

## 1. DNS

Create an `A` record in Namecheap:

- Type: `A Record`
- Host: `app`
- Value: `YOUR_SERVER_IP`

This gives you a hostname such as `app.vomoda.com`.

## 2. Server packages

On Ubuntu 24.04 LTS:

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl git ufw
```

Install Docker:

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker
```

Install Docker Compose plugin if it is not already included:

```bash
apt install -y docker-compose-plugin
```

## 3. Firewall

Allow SSH, HTTP and HTTPS:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## 4. Project files

Clone the repo and enter it:

```bash
git clone https://github.com/abdouudrh/Vomoda-cod-form.git
cd Vomoda-cod-form
```

Create the production env file:

```bash
cp .env.production.example .env.production
```

Update `.env.production` with:

- `APP_DOMAIN`
- `SHOPIFY_APP_URL`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SCOPES`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`

## 5. Shopify app config

After your domain is live, update `shopify.app.toml`:

- `application_url`
- `[auth].redirect_urls`
- `[app_proxy].url`

Point all of them to your new domain, for example:

- `https://app.vomoda.com`

Then run:

```bash
shopify app deploy --allow-updates
```

## 6. Start the app

From the project folder:

```bash
docker compose up -d --build
```

Check logs:

```bash
docker compose logs -f app
docker compose logs -f caddy
```

## 7. Updates

To deploy new code later:

```bash
git pull
docker compose up -d --build
```

## 8. Data persistence

Postgres data is stored in the Docker volume mounted for the `postgres`
service. This keeps Shopify sessions and tokens persistent on the VPS.

## 9. Recommendation

This is the stronger long-term architecture and avoids the session problems
you saw on Render free.
