# Docker Deployment

This project includes Docker support for easy deployment.

## Building the Docker Image

### Local Build

To build the Docker image locally:

```bash
docker build -t esp-pin-inspector:latest .
```

### Using Docker Compose

For local development:

```bash
docker-compose up -d
```

For production:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

## GitHub Container Registry

The GitHub Actions workflow automatically builds and pushes Docker images to GitHub Container Registry (ghcr.io) on every push to the main/master branch.

### Image Location

Images are published to: `ghcr.io/<your-username>/esp-pin-inspector`

### Using the Image

1. **Set the GITHUB_OWNER environment variable** (replace with your GitHub username/org):
   ```bash
   export GITHUB_OWNER=your-username
   ```

2. **Pull and run the image**:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Authentication

If the repository is private, you'll need to authenticate with GitHub Container Registry:

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```

Or create a personal access token with `read:packages` permission and use it.

## Watchtower Integration

The docker-compose files include labels for Watchtower to automatically update the container when new images are available:

```yaml
labels:
  - "com.centurylinklabs.watchtower.enable=true"
```

Make sure Watchtower is configured to watch for updates to `ghcr.io/<your-username>/esp-pin-inspector`.

## Production Deployment

1. Set the `GITHUB_OWNER` environment variable to your GitHub username or organization
2. Run: `docker-compose -f docker-compose.prod.yml up -d`
3. Watchtower will automatically pull and deploy new images when they're pushed to the registry

## Health Checks

The container includes a health check that verifies the nginx server is responding. You can check the health status with:

```bash
docker ps
```

Look for the `(healthy)` status next to the container name.

