# Troubleshooting

## Diagnostic Tool

Always start with:
```bash
ploybundle doctor <project-name>
```

This checks SSH connectivity, host requirements, platform health, service health, and config integrity.

## Common Issues

### SSH Connection Failed

**Symptom**: `Cannot connect to root@X.X.X.X:22`

**Causes**:
- VPS is not running
- SSH port is different (use `--host root@IP:PORT`)
- SSH key is not configured or has wrong permissions
- Firewall blocking port 22

**Fix**:
```bash
# Test manually
ssh root@YOUR_VPS_IP

# Check key permissions
chmod 600 ~/.ssh/id_rsa

# Try with specific key
ploybundle init myproject --host root@IP --preset learning-app --domain example.com
```

### Docker Installation Failed

**Symptom**: `Docker installation failed at step: ...`

**Fix**:
```bash
# SSH into the server and install Docker manually
ssh root@YOUR_VPS_IP
curl -fsSL https://get.docker.com | sh
docker --version
```

### Platform Not Healthy

**Symptom**: `CapRover is not running` or `Coolify is not running`

**Fix for CapRover**:
```bash
ssh root@YOUR_VPS_IP
docker ps -a --filter name=captain
docker logs captain
docker restart captain
```

**Fix for Coolify**:
```bash
ssh root@YOUR_VPS_IP
docker ps -a --filter name=coolify
docker logs coolify
```

### Services Not Starting

**Symptom**: Services show as unhealthy in `ploybundle status`

**Debug**:
```bash
# Check all service logs
ploybundle logs myproject

# Check a specific service
ploybundle logs myproject --service directus
ploybundle logs myproject --service postgres

# SSH and check directly
ssh root@YOUR_VPS_IP
cd /opt/ploybundle
docker compose -p myproject ps
docker compose -p myproject logs postgres
```

### Directus Won't Start

**Common causes**:
- Postgres not ready yet (Directus depends on it)
- Invalid database credentials
- Port 8055 already in use

**Fix**:
```bash
# Check Postgres is healthy first
ploybundle logs myproject --service postgres

# Restart Directus
ssh root@YOUR_VPS_IP
cd /opt/ploybundle
docker compose -p myproject restart directus
```

### SeaweedFS Buckets Not Created

**Symptom**: Directus file uploads fail, storage not working

**Fix**:
```bash
ssh root@YOUR_VPS_IP
cd /opt/ploybundle

# Run bucket init manually
docker compose -p myproject exec seaweedfs sh /scripts/init-buckets.sh
```

### DNS Not Resolving

**Symptom**: URLs return connection errors

**Check**:
```bash
# Verify DNS records
dig admin.myproject.example.com
nslookup fn.myproject.example.com

# DNS propagation can take up to 48 hours
# Use a wildcard record: *.myproject.example.com → VPS_IP
```

### Port Conflicts

**Symptom**: `Port conflicts detected on: 80, 443`

**Cause**: Another service (nginx, apache) is using these ports

**Fix**:
```bash
ssh root@YOUR_VPS_IP
# Find what's using the port
ss -tlnp | grep ':80'

# Stop the conflicting service
systemctl stop nginx
systemctl disable nginx
```

### Insufficient Resources

**Symptom**: Services crash or OOM killed

**Fix**:
- Upgrade VPS to more RAM (4GB minimum recommended)
- Use `--resource-profile medium` or `--resource-profile large`
- Disable services you don't need in `ploybundle.yaml`

### Re-deploy Not Picking Up Changes

**Fix**:
```bash
# Force re-render and re-deploy
ploybundle update myproject

# Or destroy and re-init (loses data)
ploybundle destroy myproject --yes
ploybundle init myproject ...
```

## Getting Help

1. Run `ploybundle doctor <project>` for diagnostics
2. Run `ploybundle logs <project>` for service logs
3. Check the service-specific logs via SSH
4. Review the [Architecture docs](architecture.md) for how services connect
5. Check the [Security docs](security.md) for credential issues

## Log Locations on VPS

| Location                          | Content                   |
|-----------------------------------|---------------------------|
| `/opt/ploybundle/`               | Project files             |
| `/opt/ploybundle/.env`           | Environment variables     |
| `/opt/ploybundle/.secrets.json`  | Generated credentials     |
| Docker logs                       | `docker compose logs`     |
| System logs                       | `journalctl -u docker`    |
