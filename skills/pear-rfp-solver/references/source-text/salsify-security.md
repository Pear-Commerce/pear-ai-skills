# Salsify security responses

Source file: `salsify-security (1).txt`

Salsify Integration Security Details

1) Authentication method & key management

Method: SFTP over SSH with key-based authentication only. Password authentication is disabled on the server.

Key ownership: The sender (Salsify) owns and stores the private key in their platform. Pear Commerce only receives the associated public key, which we bind to the McCormick SFTP user.
Generation: Salsify generates the key pair within their platform
Algorithms: We require modern RSA signatures (rsa-sha2-256) and disallow legacy ssh-rsa (SHA-1).
Rotation: Keys can be rotated on demand or on a set cadence
Zero Downtime Rotation flow:
- Salsify creates a new key pair and sends new public key
- Pear adds the new public key alongside the old one (grace period)
- Salsify switches to the new private key
- Pear removes the old public key.

Revocation: Immediate by removing the public key from the SFTP user (or disabling the user). We can also block by IP in security groups.

2) Tenant-specific credentials (McCormick-only)
Dedicated user & key: McCormick receives a unique SFTP username and unique key pair. No credentials or keys are shared with other customers or environments.
Scoped access: The user is chrooted to a dedicated S3 server/bucket (e.g., s3://pear-ingest/mccormick/). IAM policies prevent access outside this path.
Namespace isolation: Filenames and folders are segregated per tenant (e.g., /incoming/mccormick/).
Environment separation: Non-production environments have separate Transfer servers/buckets/keys.

3) Network exposure (private vs public; WAF/VPN)
- Public SFTP endpoint on port 22 but restricted by IP allowlisting in AWS Security Groups and NACLs. We will allow only Salsify’s documented egress IP ranges
- Transport security: SSH encryption end-to-end; modern ciphers only

4) Logging & audit trail
Connection events: We log connect/disconnect attempts, authentication success/failure, source IP, username.
File operations: We log upload/download/rename/delete events, including object keys (paths/filenames), sizes, timestamps, and status.
Alerting: AWS GuardDog/Cloudwatch alarms (e.g., repeated auth failures, unexpected traffic)

5) Retention
Configurable; default 365 days, extendable per McCormick policy.
